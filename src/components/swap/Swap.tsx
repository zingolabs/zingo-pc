import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import cstyles from "../common/Common.module.css";
import styles from "./Swap.module.css";
import { ContextApp } from "../../context/ContextAppState";
import { ServerChainNameEnum } from "../appstate";
import { useSwapService } from "../../context/ContextSwapService";
import ScrollPaneTop from "../scrollPane/ScrollPane";
import Utils from "../../utils/utils";
import { describeSendRoute } from "../../rpc/components/mixnetPresenter";
import { native } from "../../electronBridge";
import {
  SwapDirectionEnum,
  SwapKitHttpError,
  describeEmptyQuote,
  extractFiatValueBasis,
  formatAmountForDisplay,
  providerShortLabel,
  quoteAddressPair,
  quoteBindsAddress,
  validateAddressForChain,
  zecNetworkFeeReserve,
} from "../../swap";
import type {
  FiatValueBasisType,
  QuoteInput,
  RouteOptionType,
  TokenEntryType,
  UnavailableProviderType,
} from "../../swap";
import { ZEC_ASSET, isQuotableToken, tokenToSwapAsset } from "./swapAssets";
import SwapExecute from "./SwapExecute";
import AssetPair from "./AssetPair";
import { chainDisplayName } from "./chainDisplayName";
import QuoteRefreshRing from "./QuoteRefreshRing";
import AssetPicker from "./AssetPicker";
import QuotesPicker from "./QuotesPicker";
import SlippagePicker, { formatSlippagePercent } from "./SlippagePicker";
import InsufficientFunds from "./InsufficientFunds";
import ContactPicker from "../common/ContactPicker";
import SaveContact from "./SaveContact";

/** SwapKit's default slippage tolerance, in basis points. */
const DEFAULT_SLIPPAGE_BPS = 100;

/**
 * How long a quote is shown before it is replaced. See the refresh effect for
 * why the providers' own expiries are not used instead.
 */
const QUOTE_REFRESH_MS = 20_000;

/**
 * How long the amount must sit still before it is quoted. Long enough that
 * typing an amount digit by digit asks once, short enough that the wait does
 * not read as the screen ignoring the input.
 */
const QUOTE_DEBOUNCE_MS = 1_000;

/**
 * Floor between two hand-asked quotes. The ring fires immediately on click;
 * without this, holding it down would be one HTTP request per press.
 */
const MANUAL_REFRESH_COOLDOWN_MS = 5_000;

/** The catalog entry the picker starts on, before the user chooses. */
const DEFAULT_TOKEN_IDENTIFIER = "BTC.BTC";

/**
 * The swap screen: pick the other side, state an amount, and quote it.
 *
 * ZEC is always one side. `direction` decides which: outbound sells ZEC,
 * inbound buys it. The screen starts on whichever the wallet's balance
 * suggests, and the user can flip it.
 */
type SwapProps = {
  addAddressBookEntry: (label: string, address: string, chain: ServerChainNameEnum, swapChain?: string) => void;
  sendSwapDeposit: (args: {
    depositAddress: string;
    amountAtomic: number;
    memoBytes?: Uint8Array;
    routeViaEphemeral?: boolean;
  }) => Promise<string[]>;
};

const Swap: React.FC<SwapProps> = ({ sendSwapDeposit, addAddressBookEntry }) => {
  const { totalBalance, currentWallet, info, readOnly, zecPrice, addressBook, swapToState, setSwapTo, mixnetView } =
    useContext(ContextApp);
  const swapService = useSwapService();

  const [direction, setDirection] = useState<SwapDirectionEnum>(() =>
    (totalBalance?.totalSpendableBalance ?? 0) > 0 ? SwapDirectionEnum.Outbound : SwapDirectionEnum.Inbound,
  );
  const isOutbound = direction === SwapDirectionEnum.Outbound;

  const [tokens, setTokens] = useState<TokenEntryType[] | null>(null);
  const [catalogError, setCatalogError] = useState<string>("");
  // SwapKit's edge refusing the request outright — a region or ISP block, not
  // a server having a bad day. Told apart from any other failure because the
  // way out is different: a VPN, not waiting.
  const [catalogEdgeBlocked, setCatalogEdgeBlocked] = useState<boolean>(false);
  const [catalogRetrying, setCatalogRetrying] = useState<boolean>(false);
  const [selectedToken, setSelectedToken] = useState<TokenEntryType | null>(null);

  const [amount, setAmount] = useState<string>("");
  // Two fields, not one reused across directions: they mean different things
  // and belong to different swaps. Outbound, the destination is where the
  // bought asset lands. Inbound, the refund is where the sold asset returns if
  // the swap fails. Both are on the non-ZEC chain, and keeping them apart is
  // what lets a flip restore what the user already typed for that direction
  // instead of handing them the other side's address.
  const [destinationAddress, setDestinationAddress] = useState<string>("");
  const [refundAddress, setRefundAddress] = useState<string>("");
  // The error waits for the field to lose focus, so the user is told after
  // committing to a value rather than while halfway through typing it.
  const [destinationAddressTouched, setDestinationAddressTouched] = useState<boolean>(false);
  const [refundAddressTouched, setRefundAddressTouched] = useState<boolean>(false);
  const [addressValid, setAddressValid] = useState<boolean>(true);

  // The refund-scope address declared to SwapKit as this swap's wallet side,
  // and the one an outbound deposit's ZIP 320 hop will spend through. Held for
  // the life of a swap intent, and cleared when the intent changes.
  //
  // Derived rather than reserved, so browsing quotes leaves the wallet's index
  // where it was. Committing is what claims it: an outbound commit through the
  // proposal it applies, an inbound one through `SwapExecute`, which has no
  // proposal to do it for them. Until a commit lands, asking again answers with
  // the same address.
  const [ephemeralAddress, setEphemeralAddress] = useState<string>("");

  const [routes, setRoutes] = useState<RouteOptionType[] | null>(null);
  // Alongside the routes rather than derived from them: what a provider said
  // about refusing is in the quote response, and nothing in the routes it
  // returned can reconstruct it.
  const [unavailable, setUnavailable] = useState<UnavailableProviderType[]>([]);
  const [chosenRouteId, setChosenRouteId] = useState<string>("");
  const [quoteContext, setQuoteContext] = useState<{
    quoteInput: QuoteInput;
    fiatValueBasis: FiatValueBasisType;
  } | null>(null);
  const [reviewing, setReviewing] = useState<boolean>(false);
  const [refreshedAtMs, setRefreshedAtMs] = useState<number>(0);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [quoting, setQuoting] = useState<boolean>(false);
  const [quoteError, setQuoteError] = useState<string>("");
  // "The last quote attempt for the current inputs failed" — kept as a separate
  // flag so the auto-fire debounce does not retry the same failing combination
  // forever (amount below provider minimum, no route, network transient…).
  // Cleared whenever an input that affects the quote actually changes.
  const [quoteAttemptFailed, setQuoteAttemptFailed] = useState<boolean>(false);
  // Manual-refresh rate limit. The ring beside the countdown triggers an
  // immediate re-quote; without a cooldown a spammed click would fire one HTTP
  // request per press.
  const [manualRefreshCooldownUntilMs, setManualRefreshCooldownUntilMs] = useState<number>(0);
  const [pickerOpen, setPickerOpen] = useState<boolean>(false);
  const [quotesOpen, setQuotesOpen] = useState<boolean>(false);
  const [slippageOpen, setSlippageOpen] = useState<boolean>(false);
  const [slippageBps, setSlippageBps] = useState<number>(DEFAULT_SLIPPAGE_BPS);
  const [insufficientOpen, setInsufficientOpen] = useState<boolean>(false);
  const [contactsOpen, setContactsOpen] = useState<boolean>(false);
  const [saveContactOpen, setSaveContactOpen] = useState<boolean>(false);

  const spendable = totalBalance?.totalSpendableBalance ?? 0;

  // Callable from the effect below, from the banner's retry, and from the
  // window regaining focus. The ref-tracked token protects against re-entry:
  // only the most recent invocation writes to state, so a slow first attempt
  // cannot overwrite the success of a fresh retry.
  const loadCatalogRef = useRef<{ cancelled: boolean } | null>(null);
  const loadCatalog = useCallback(async () => {
    if (!swapService) return;
    if (loadCatalogRef.current) loadCatalogRef.current.cancelled = true;
    const token = { cancelled: false };
    loadCatalogRef.current = token;
    setCatalogRetrying(true);
    try {
      const catalog = (await swapService.listRoutableTokens(isOutbound ? "outbound" : "inbound")).filter(
        isQuotableToken,
      );
      if (token.cancelled) return;
      setTokens(catalog);
      setCatalogError("");
      setCatalogEdgeBlocked(false);
      setSelectedToken(catalog.find((t) => t.identifier === DEFAULT_TOKEN_IDENTIFIER) ?? catalog[0] ?? null);
    } catch (error) {
      if (token.cancelled) return;
      setTokens([]);
      // An edge block gets the banner and no error line: the banner already
      // says more, and better, than the raw message would.
      const edgeBlocked = error instanceof SwapKitHttpError && error.isEdgeBlocked;
      setCatalogEdgeBlocked(edgeBlocked);
      setCatalogError(edgeBlocked ? "" : `${error}`);
    } finally {
      if (!token.cancelled) setCatalogRetrying(false);
    }
  }, [swapService, isOutbound]);

  useEffect(() => {
    loadCatalog();
    return () => {
      if (loadCatalogRef.current) loadCatalogRef.current.cancelled = true;
    };
  }, [loadCatalog]);

  // Retry silently when the window regains focus while the banner is up. The
  // flow it serves: user reads the banner, alt-tabs to their VPN client,
  // comes back. If it works the banner goes without them asking. This is the
  // desktop counterpart of the mobile wallet retrying on app foreground.
  useEffect(() => {
    if (!catalogEdgeBlocked) return;
    const onFocus = () => loadCatalog();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [catalogEdgeBlocked, loadCatalog]);

  // Only the changes that make a shown quote meaningless clear it: flipping
  // direction swaps which side is ZEC, and a different asset prices something
  // else entirely.
  //
  // The amount and the slippage are deliberately not here. They do produce a
  // fresh quote, but through the auto-fire below, which replaces the numbers
  // in place. Clearing here instead would blank the panel on every keystroke
  // and bring it back a second later.
  //
  // The address is not here either, though it is in the quote's inputs. It
  // re-quotes through the same auto-fire as the amount, for the same reason:
  // typing one should replace the numbers rather than blank the panel.
  useEffect(() => {
    setRoutes(null);
    setUnavailable([]);
    setChosenRouteId("");
    setQuoteContext(null);
    setReviewing(false);
    setQuoteError("");
  }, [direction, selectedToken]);

  // A swap intent is a direction and an asset; change either and this is a
  // different swap, so the next quote asks the wallet again. Carrying one
  // address across intents would let a provider tie two unrelated swaps to a
  // single identifier, which is the whole thing the ephemeral scope avoids.
  useEffect(() => {
    setEphemeralAddress("");
  }, [direction, selectedToken?.identifier]);

  // If the user picked a wrapped-ZEC token while inbound and then flips to
  // outbound, the chip would point at an asset we are about to refuse to
  // route to. Snap it back to a safe default so the form stays consistent.
  useEffect(() => {
    if (!isOutbound || !selectedToken || !tokens) return;
    const ticker = (selectedToken.ticker || selectedToken.symbol || "").toUpperCase();
    if (ticker === "ZEC") {
      setSelectedToken(tokens.find((t) => t.identifier === DEFAULT_TOKEN_IDENTIFIER) ?? tokens[0] ?? null);
    }
  }, [isOutbound, selectedToken, tokens]);

  // Arriving from the Address Book: fill the address and point the asset chip
  // at that chain. Consumed once and cleared, so coming back to this screen
  // later does not refill a field the user deliberately emptied. Waits for the
  // catalog, which is what turns a chain code into a selectable asset.
  useEffect(() => {
    if (!swapToState || !tokens || tokens.length === 0) return;
    const match = tokens.find((t) => (t.chain ?? "").toUpperCase() === swapToState.swapChain.toUpperCase());
    // The contact is the far side of the swap, so this only makes sense
    // outbound: that is the direction whose destination the user types.
    setDirection(SwapDirectionEnum.Outbound);
    if (match) setSelectedToken(match);
    setDestinationAddress(swapToState.address);
    setDestinationAddressTouched(true);
    setSwapTo(null);
  }, [swapToState, tokens, setSwapTo]);

  const counterpartyChain = selectedToken?.chain ?? "";

  // An address that was valid for the previous chain is almost certainly wrong
  // for the new one, and leaving it in the field invites sending to it.
  useEffect(() => {
    setDestinationAddress("");
    setRefundAddress("");
    setDestinationAddressTouched(false);
    setRefundAddressTouched(false);
  }, [direction, counterpartyChain]);

  // Whichever field is live for the current direction. Both sit on the non-ZEC
  // chain: outbound the bought asset lands there, inbound the sold asset
  // returns there. The wallet's own ZEC address is never typed — it is the
  // ephemeral one this screen derives.
  const activeAddress = isOutbound ? destinationAddress : refundAddress;
  const setActiveAddress = isOutbound ? setDestinationAddress : setRefundAddress;
  const activeAddressTouched = isOutbound ? destinationAddressTouched : refundAddressTouched;
  const setActiveAddressTouched = isOutbound ? setDestinationAddressTouched : setRefundAddressTouched;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const valid = await validateAddressForChain(counterpartyChain, activeAddress, currentWallet?.chain_name);
      if (!cancelled) setAddressValid(valid);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeAddress, counterpartyChain, currentWallet]);

  const addressShowError = activeAddressTouched && activeAddress.trim().length > 0 && !addressValid;

  // Contacts for the chain being asked for. Zcash entries written before swaps
  // existed carry no `swapChain`; the address book migration stamps them ZEC
  // on read, so this comparison holds for old and new alike.
  const chainContacts = useMemo(
    () => (addressBook ?? []).filter((c) => (c.swapChain ?? "") === counterpartyChain),
    [addressBook, counterpartyChain],
  );
  const activeContactLabel = useMemo(
    () => chainContacts.find((c) => c.address === activeAddress)?.label,
    [chainContacts, activeAddress],
  );
  const activeAddressSaved = useMemo(
    () => chainContacts.some((c) => c.address === activeAddress),
    [chainContacts, activeAddress],
  );

  // Saving asks for the label, which is the only thing the contact needs that
  // is not already on screen. `chain` is mainnet because swaps are mainnet-only;
  // `swapChain` is what actually identifies a Bitcoin or Ethereum address.
  const saveActiveAddress = (label: string) => {
    addAddressBookEntry(label, activeAddress.trim(), ServerChainNameEnum.mainChainName, counterpartyChain);
  };

  const amountNumber = parseFloat(amount.replace(",", "."));
  const amountValid = Number.isFinite(amountNumber) && amountNumber > 0;
  // Only meaningful when this wallet is the one paying. Inbound, the funds come
  // from somewhere else entirely and this wallet has no idea what that account
  // holds — refusing on our own ZEC balance would be answering a question
  // nobody asked.
  const overBalance = isOutbound && amountValid && amountNumber > spendable;

  // Emptying the amount means there is nothing to quote, but the panel must not
  // blank the instant the number hits zero: erasing the last digit of `0.02` to
  // retype `0.03` passes through an empty field, and clearing there would make
  // the quote jump away and back on every edit. Debounced with the same window
  // as the auto-fire, so only a field *left* empty clears.
  useEffect(() => {
    if (amountValid) return;
    const timer = setTimeout(() => {
      setRoutes(null);
      setUnavailable([]);
      setChosenRouteId("");
      setQuoteContext(null);
      setQuoteError("");
      setQuoteAttemptFailed(false);
    }, QUOTE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [amountValid]);

  // The quote needs an asset and an amount. The address is the review's
  // requirement, not the quote's.
  const canQuote = !!swapService && !!selectedToken && amountValid;
  const addressReady = activeAddress.trim().length > 0 && addressValid;

  const deriveEphemeral = useCallback(async (): Promise<string> => {
    if (ephemeralAddress) return ephemeralAddress;
    const raw: string = await native.derive_refund_address();
    const parsed = JSON.parse(raw) as { encoded_address?: string };
    if (!parsed.encoded_address) {
      throw new Error("the wallet named no refund address for this swap");
    }
    setEphemeralAddress(parsed.encoded_address);
    return parsed.encoded_address;
  }, [ephemeralAddress]);

  // The counterparty address the next quote should carry, empty while there
  // is nothing valid to carry. Trimmed here so the value compared against the
  // committed quote below is the same one that was sent.
  const boundAddress = addressReady ? activeAddress.trim() : "";

  const requestQuote = useCallback(async () => {
    if (!swapService || !selectedToken) return;
    setQuoting(true);
    setQuoteError("");
    try {
      const ephemeral = await deriveEphemeral();
      const other = tokenToSwapAsset(selectedToken);
      const quoteInput: QuoteInput = {
        sellAsset: isOutbound ? ZEC_ASSET : other,
        receiveAsset: isOutbound ? other : ZEC_ASSET,
        // SwapKit reads a dot-separated decimal whatever the user's locale.
        sellAmountHumanDecimal: amount.replace(",", "."),
        ...quoteAddressPair({ isOutbound, ephemeralAddress: ephemeral, boundAddress }),
        slippageBps,
      };
      const result = await swapService.quote(quoteInput);
      // No route is a real answer about the market right now, not a glitch:
      // the amount sits below every provider's minimum, or the liquidity is
      // gone. SwapKit says which in `providerErrors`, so quote the minimum
      // when that is the reason — "no route" sends the user hunting for a
      // fault when all they need is a slightly larger amount.
      setQuoteError(
        result.routes.length === 0 ? describeEmptyQuote(result.rawResponse, quoteInput.sellAsset.ticker) : "",
      );
      // An empty answer counts as a failed attempt: asking the same question
      // again a second later gets the same answer, and the amount is the thing
      // the user has to change.
      setQuoteAttemptFailed(result.routes.length === 0);
      // A refresh must not silently move the user's choice. Route ids are
      // minted per quote, so the pick is carried across by provider, which is
      // what the user actually chose. A provider that dropped out falls back
      // to the best route rather than leaving nothing selected.
      setChosenRouteId((previous) => {
        const chosenProvider = routesRef.current?.find((r) => r.routeId === previous)?.provider;
        const sameProvider = result.routes.find((r) => r.provider === chosenProvider);
        return (sameProvider ?? result.routes[0])?.routeId ?? "";
      });
      setRoutes(result.routes);
      setUnavailable(result.unavailable);
      setRefreshedAtMs(Date.now());
      // Pinned alongside the routes because they describe the request that
      // produced them, and the commit has to use the same inputs the user was
      // shown rather than whatever the form holds by then.
      setQuoteContext({
        quoteInput,
        fiatValueBasis: extractFiatValueBasis({
          response: result.rawResponse,
          sellAssetId: quoteInput.sellAsset.swapKitId,
          receiveAssetId: quoteInput.receiveAsset.swapKitId,
          capturedAt: Date.now(),
        }),
      });
    } catch (error) {
      setQuoteError(`${error}`);
      setRoutes(null);
      setUnavailable([]);
      setQuoteContext(null);
      setQuoteAttemptFailed(true);
    } finally {
      setQuoting(false);
    }
  }, [swapService, selectedToken, isOutbound, amount, slippageBps, boundAddress, deriveEphemeral]);

  // Quote as soon as there is something to quote, rather than waiting for a
  // press. The debounce is what makes that affordable: an amount typed digit
  // by digit settles into one request instead of one per keystroke.
  useEffect(() => {
    if (!canQuote || reviewing || quoting) return;
    // Do NOT re-fire when the last attempt for the CURRENT inputs already
    // failed (below-minimum amount, no route, provider transient…). Without
    // this guard the debounce keeps hammering the API with the same failing
    // request. The flag clears when an input actually changes, so a legitimate
    // new attempt still happens.
    if (quoteAttemptFailed) return;
    const timer = setTimeout(() => requestQuote(), QUOTE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    //  is intentionally absent: it is rebuilt whenever the
    // amount changes, which would restart the debounce on every keystroke and
    // then fire immediately once it settled, defeating the delay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canQuote, reviewing, amount, slippageBps, selectedToken, direction, boundAddress, quoteAttemptFailed]);

  // Any input change that could make a previously-failed attempt worth
  // retrying clears the flag, so the auto-fire schedules again for the new
  // inputs. Separate from the effect that discards the routes: this one must
  // not blank the panel, or changing the amount after a "no route" would
  // flicker it away before the replacement lands.
  useEffect(() => {
    setQuoteAttemptFailed(false);
  }, [amount, slippageBps, selectedToken, direction, boundAddress]);

  const chosenRoute = useMemo(() => routes?.find((r) => r.routeId === chosenRouteId) ?? null, [routes, chosenRouteId]);

  // Whether the routes on screen were quoted for the address on screen. They
  // are not, briefly, whenever the address is entered or edited after a quote
  // has already landed, and committing one of those asks the provider to
  // honour a route it built for somewhere else.
  const routesBindAddress = useMemo(
    () => quoteBindsAddress({ quoted: quoteContext?.quoteInput ?? null, isOutbound, boundAddress }),
    [quoteContext, boundAddress, isOutbound],
  );

  // The largest amount that can actually be swapped: the balance minus what
  // the route charges on the sell side. Offering the bare balance would send
  // the user straight back to the same refusal, because the fees come out of
  // the same pot. Without a quote the fees are unknown, so it degrades to the
  // balance rather than guessing.
  const totalFeesInSellAssetNum = useMemo(() => {
    const parsed = parseFloat(chosenRoute?.totalFeesInSellAsset ?? "");
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [chosenRoute]);
  // Held back for the Zcash network fee on the deposit itself, which comes out
  // of the same balance and which the route's own fees say nothing about.
  // Zero inbound, where the deposit is paid from another wallet entirely, and
  // zero before a route names a provider — the amount depends on whether the
  // deposit takes the two-transaction ephemeral hop.
  const networkFeeReserve = useMemo(
    () => (isOutbound && chosenRoute ? zecNetworkFeeReserve(chosenRoute.provider) : 0),
    [isOutbound, chosenRoute],
  );
  const maxSpendableForSwap = useMemo(
    () => Math.max(0, spendable - totalFeesInSellAssetNum - networkFeeReserve),
    [spendable, totalFeesInSellAssetNum, networkFeeReserve],
  );

  // Whether committing would actually be refused for want of funds. Outbound
  // only, and only once a route has priced the fees — they come out of the same
  // balance, so `amount` alone understates what the swap costs. Inbound this is
  // never true: the source account belongs to someone else's wallet.
  const insufficientForCommit = useMemo(
    () =>
      isOutbound &&
      !!chosenRoute &&
      amountValid &&
      amountNumber + totalFeesInSellAssetNum + networkFeeReserve > spendable,
    [isOutbound, chosenRoute, amountValid, amountNumber, totalFeesInSellAssetNum, networkFeeReserve, spendable],
  );

  // Read inside `requestQuote` to carry the user's pick across a refresh
  // without making the callback depend on `routes`, which would rebuild it on
  // every refresh and restart the interval below.
  const routesRef = useRef<RouteOptionType[] | null>(null);
  useEffect(() => {
    routesRef.current = routes;
  }, [routes]);

  // Re-quote on a fixed cadence rather than trusting the providers' own
  // expiries: they advertise tens of minutes (NEAR an hour, Maya around 75
  // minutes), which reads as price stability the rate does not have. The tick
  // pauses while the review modal is open so the user confirms against the
  // snapshot they were shown, and the provider refuses a stale commit itself
  // if they linger.
  useEffect(() => {
    if (!routes?.length || reviewing || quoting) return;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [routes, reviewing, quoting]);

  const secondsToRefresh = Math.max(0, Math.ceil((refreshedAtMs + QUOTE_REFRESH_MS - nowMs) / 1000));

  useEffect(() => {
    if (!routes?.length || reviewing || quoting) return;
    if (nowMs - refreshedAtMs < QUOTE_REFRESH_MS) return;
    requestQuote();
  }, [nowMs, refreshedAtMs, routes, reviewing, quoting, requestQuote]);

  // The sidebar hides its entry in both cases, so reaching this is a direct
  // navigation. Saying which condition fails beats an empty form.
  if (readOnly || !swapService) {
    return (
      <div>
        <div className={`${cstyles.center} ${cstyles.margintoplarge}`}>
          {readOnly
            ? "A swap pays a deposit, which needs spend authority. This wallet was opened with a viewing key only."
            : "Swaps run on mainnet only, and need a connected wallet."}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className={`${cstyles.xlarge} ${cstyles.screentitle} ${cstyles.center}`}>Swap</div>

      <ScrollPaneTop offsetHeight={152}>
        <div className={`${cstyles.well} ${styles.panel}`} style={{ margin: "0 16px 16px" }}>
          {/* The two sides. The address belongs to whichever card is not ZEC:
              outbound it is where the bought asset lands, inbound it is the
              refund address on the source chain — the same field either way,
              "where funds reach you", which is why it sits in that card. */}
          <AssetPair
            onToggleDirection={() => setDirection(isOutbound ? SwapDirectionEnum.Inbound : SwapDirectionEnum.Outbound)}
            source={{
              role: "source",
              isZec: isOutbound,
              token: isOutbound ? null : selectedToken,
              balanceLabel: isOutbound ? `Spendable: ${spendable} ${info.currencyName}` : undefined,
              amount,
              editable: true,
              invalid: overBalance,
              onChangeAmount: setAmount,
              // The refusal takes the slot when there is one; otherwise the
              // fiat value, which mobile shows on the ZEC side only — it is
              // the one asset this wallet holds a price for.
              amountSub: overBalance ? (
                <span style={{ color: Utils.getCssVariable("--color-error") }}>
                  That is more than the spendable balance.
                </span>
              ) : isOutbound && amountValid && zecPrice > 0 ? (
                Utils.getZecToUsdString(zecPrice, amountNumber)
              ) : undefined,
              onSelectAsset: () => setPickerOpen(true),
              selectDisabled: !tokens || tokens.length === 0,
              address: isOutbound
                ? undefined
                : {
                    label: "Your refund address on the source chain",
                    contactLabel: activeContactLabel,
                    value: activeAddress,
                    placeholder: "Enter address",
                    invalid: addressShowError,
                    errorText: "That address does not look valid for this chain.",
                    onChange: setActiveAddress,
                    onBlur: () => setActiveAddressTouched(true),
                    onPick: () => setContactsOpen(true),
                    onSave:
                      activeAddress.trim().length > 0 && addressValid && !activeAddressSaved
                        ? () => setSaveContactOpen(true)
                        : undefined,
                  },
            }}
            destination={{
              role: "destination",
              isZec: !isOutbound,
              token: isOutbound ? selectedToken : null,
              amount: chosenRoute ? formatAmountForDisplay(chosenRoute.expectedReceiveAmount) : "",
              editable: false,
              // Inbound the destination is ZEC, so the estimate has a fiat
              // value the same way the source does when outbound.
              amountSub:
                !isOutbound && chosenRoute && zecPrice > 0
                  ? Utils.getZecToUsdString(zecPrice, parseFloat(chosenRoute.expectedReceiveAmount))
                  : undefined,
              onSelectAsset: () => setPickerOpen(true),
              selectDisabled: !tokens || tokens.length === 0,
              address: isOutbound
                ? {
                    label: `Your ${chainDisplayName(counterpartyChain) || counterpartyChain} address`,
                    contactLabel: activeContactLabel,
                    value: activeAddress,
                    placeholder: "Enter address",
                    invalid: addressShowError,
                    errorText: "That address does not look valid for this chain.",
                    onChange: setActiveAddress,
                    onBlur: () => setActiveAddressTouched(true),
                    onPick: () => setContactsOpen(true),
                    onSave:
                      activeAddress.trim().length > 0 && addressValid && !activeAddressSaved
                        ? () => setSaveContactOpen(true)
                        : undefined,
                  }
                : undefined,
            }}
          />

          {/* Below the pair rather than inside a card: a catalog that failed to
              load is about the screen, not about either asset. */}
          {catalogEdgeBlocked && (
            <div className={styles.regionblockbanner}>
              <div className={cstyles.large} style={{ marginBottom: 4 }}>
                Swap service unavailable on this network
              </div>
              <div>
                The swap provider is blocking requests from your network. If your country or ISP is restricted,
                connecting through a VPN usually resolves this.
              </div>
              <button
                type="button"
                className={cstyles.primarybutton}
                style={{ marginTop: 10, marginLeft: 0 }}
                onClick={loadCatalog}
                disabled={catalogRetrying}
              >
                {catalogRetrying ? "Retrying..." : "Retry"}
              </button>
            </div>
          )}

          {catalogError && (
            <div
              className={`${cstyles.center} ${cstyles.padtopsmall}`}
              style={{ color: Utils.getCssVariable("--color-error") }}
            >
              {catalogError}
            </div>
          )}

          <div className={cstyles.padtopsmall}>
            <div className={`${cstyles.sublight} ${cstyles.small} ${cstyles.marginbottomsmall}`}>
              Slippage tolerance
            </div>
            <button
              type="button"
              onClick={() => setSlippageOpen(true)}
              style={{
                background: "none",
                border: "1px solid var(--color-primary)",
                borderRadius: 4,
                padding: "4px 10px",
                color: "inherit",
                cursor: "pointer",
              }}
            >
              {formatSlippagePercent(slippageBps)}%
            </button>
          </div>

          {/* No button to ask for a quote: it arrives on its own once there is
              an asset and an amount. This line is what the wait looks like. */}
          {canQuote && !routes?.length && (
            <div className={`${cstyles.center} ${cstyles.sublight} ${cstyles.padtopsmall}`}>
              {quoting ? "Quoting..." : quoteError ? "" : "Waiting for a quote..."}
            </div>
          )}

          {/* Stated because the mixnet indicator does not cover this screen.
              A user reading it as "my traffic is private" would be wrong here,
              and the difference is worth knowing before asking for a quote
              rather than after. Phrased as what the provider sees, since that
              is the fact; the remedy is the user's to choose. */}
          <div className={`${cstyles.center} ${cstyles.sublight} ${cstyles.small} ${cstyles.margintoplarge}`}>
            Swaps reach the provider directly, not through the mixnet. Quoting and tracking a swap shows the provider
            your IP address alongside the assets, the amount, and the addresses involved.
          </div>

          {/* The deposit is an ordinary ZEC send, so it takes the route Mixnet
              Mode dictates and refuses in the states nobody consented to. Said
              here, beside the sentence about the provider, because the two
              halves of a swap travel differently and only one of them is
              covered by the line above. */}
          {isOutbound && (
            <div
              className={`${mixnetView.sendBlocked ? cstyles.yellow : cstyles.sublight} ${cstyles.small} ${cstyles.center} ${cstyles.padtopsmall}`}
            >
              {describeSendRoute(mixnetView)}
            </div>
          )}
        </div>

        {quoteError && (
          <div
            className={`${cstyles.center} ${cstyles.margintoplarge}`}
            style={{ color: Utils.getCssVariable("--color-error") }}
          >
            {quoteError}
          </div>
        )}

        {!!routes?.length && (
          <div className={`${cstyles.well} ${styles.panel}`} style={{ margin: "0 16px 16px" }}>
            <div className={cstyles.horizontalflex} style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div className={cstyles.large}>Routes</div>
              {/* The ring is the honest reading of how old the rate is, and the
                  control that refreshes it by hand — the same double duty it
                  serves on mobile. It pauses while the review modal is open,
                  because the quote the user is confirming is the one they were
                  shown. */}
              <div className={cstyles.horizontalflex} style={{ alignItems: "center", gap: 10 }}>
                <div className={`${cstyles.sublight} ${cstyles.small}`}>
                  {quoting
                    ? "Refreshing..."
                    : reviewing
                      ? "Paused while you review"
                      : `Refreshing in ${secondsToRefresh}s`}
                </div>
                <QuoteRefreshRing
                  size={28}
                  color={Utils.getCssVariable("--color-primary")}
                  trackColor={Utils.getCssVariable("--color-primary-disable")}
                  durationMs={QUOTE_REFRESH_MS}
                  // Restarts the fill on every fresh quote, manual or automatic.
                  // Paused review keeps the same key, so the ring holds where it is.
                  resetKey={refreshedAtMs}
                  onPress={() => {
                    setManualRefreshCooldownUntilMs(Date.now() + MANUAL_REFRESH_COOLDOWN_MS);
                    // A hand-asked quote is a new attempt by definition, so a
                    // previous failure must not silence it.
                    setQuoteAttemptFailed(false);
                    requestQuote();
                  }}
                  disabled={quoting || reviewing || nowMs < manualRefreshCooldownUntilMs}
                  title="Refresh the quote now"
                />
              </div>
            </div>
            {!!chosenRoute && (
              <div className={cstyles.padtopsmall}>
                <div className={cstyles.large}>
                  {formatAmountForDisplay(chosenRoute.expectedReceiveAmount)}{" "}
                  {isOutbound ? (selectedToken?.ticker ?? "") : "ZEC"}
                </div>
                <div className={`${cstyles.sublight} ${cstyles.small}`}>
                  via {providerShortLabel(chosenRoute.provider)}
                  {chosenRoute.estimatedTimeText ? ` — ${chosenRoute.estimatedTimeText}` : ""}
                </div>
                {!!chosenRoute.warningsText && (
                  <div className={cstyles.small} style={{ color: Utils.getCssVariable("--color-warning") }}>
                    {chosenRoute.warningsText}
                  </div>
                )}
              </div>
            )}

            <div className={`${cstyles.horizontalflex} ${cstyles.padtopsmall}`} style={{ justifyContent: "center" }}>
              <button
                type="button"
                className={cstyles.primarybutton}
                // Openable on a single route when there are refusals to read:
                // "why is there only one" is the question that list answers.
                disabled={routes.length < 2 && unavailable.length === 0}
                onClick={() => setQuotesOpen(true)}
              >
                {routes.length >= 2
                  ? `Compare ${routes.length} routes`
                  : unavailable.length > 0
                    ? "Why only one route?"
                    : "Only one route"}
              </button>
              {/* The button changes identity rather than always saying
                  "Review" and then explaining a refusal in a modal. Only a
                  genuine shortfall opens the funds modal; a missing or invalid
                  address leaves the button disabled, which is what it means. */}
              {insufficientForCommit ? (
                <button type="button" className={cstyles.primarybutton} onClick={() => setInsufficientOpen(true)}>
                  Insufficient funds &nbsp;
                  <i className={`${"fas"} ${"fa-info-circle"}`} />
                </button>
              ) : (
                <button
                  type="button"
                  className={cstyles.primarybutton}
                  disabled={!chosenRoute || !routesBindAddress || (isOutbound && mixnetView.sendBlocked)}
                  onClick={() => setReviewing(true)}
                >
                  Review
                </button>
              )}
            </div>
          </div>
        )}

        {reviewing && chosenRoute && quoteContext && (
          <SwapExecute
            swapService={swapService}
            // Exactly what was quoted, addresses included. Substituting them
            // here was what produced routes the provider would not commit:
            // the route it minted named a different destination from the one
            // the swap call then asked it to pay.
            quoteInput={quoteContext.quoteInput}
            route={chosenRoute}
            fiatValueBasis={quoteContext.fiatValueBasis}
            direction={direction}
            sendSwapDeposit={sendSwapDeposit}
            // A completed swap leaves the form empty rather than pre-filled
            // with what was just sent: the next swap is a new decision, and
            // leaving the amount and address sitting there invites repeating a
            // transfer by accident.
            onDone={() => {
              setReviewing(false);
              setRoutes(null);
              setUnavailable([]);
              setChosenRouteId("");
              setQuoteContext(null);
              setAmount("");
              setDestinationAddress("");
              setRefundAddress("");
              setDestinationAddressTouched(false);
              setRefundAddressTouched(false);
              // A fresh swap gets a fresh ephemeral address: reusing one across
              // two swaps would let the provider link them.
              setEphemeralAddress("");
            }}
          />
        )}
      </ScrollPaneTop>

      {saveContactOpen && (
        <SaveContact
          address={activeAddress.trim()}
          chainLabel={chainDisplayName(counterpartyChain) || counterpartyChain}
          modalIsOpen={saveContactOpen}
          closeModal={() => setSaveContactOpen(false)}
          onSave={saveActiveAddress}
        />
      )}

      {contactsOpen && (
        <ContactPicker
          contacts={chainContacts}
          chainLabel={chainDisplayName(counterpartyChain) || counterpartyChain}
          modalIsOpen={contactsOpen}
          closeModal={() => setContactsOpen(false)}
          onSelect={(address) => {
            setActiveAddress(address);
            setActiveAddressTouched(true);
          }}
        />
      )}

      {insufficientOpen && (
        <InsufficientFunds
          spendable={spendable}
          maxSpendableForSwap={maxSpendableForSwap}
          modalIsOpen={insufficientOpen}
          closeModal={() => setInsufficientOpen(false)}
          onReduce={setAmount}
        />
      )}

      {slippageOpen && (
        <SlippagePicker
          slippageBps={slippageBps}
          modalIsOpen={slippageOpen}
          closeModal={() => setSlippageOpen(false)}
          onChange={setSlippageBps}
        />
      )}

      {quotesOpen && !!routes?.length && (
        <QuotesPicker
          routes={routes}
          unavailable={unavailable}
          selectedRouteId={chosenRouteId}
          receiveSymbol={isOutbound ? (selectedToken?.ticker ?? "") : "ZEC"}
          sellSymbol={isOutbound ? "ZEC" : (selectedToken?.ticker ?? "")}
          direction={direction}
          modalIsOpen={quotesOpen}
          closeModal={() => setQuotesOpen(false)}
          onSelect={setChosenRouteId}
        />
      )}

      {pickerOpen && !!tokens && (
        <AssetPicker
          tokens={tokens}
          selected={selectedToken}
          modalIsOpen={pickerOpen}
          closeModal={() => setPickerOpen(false)}
          onSelect={setSelectedToken}
        />
      )}
    </div>
  );
};

export default Swap;
