import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import cstyles from "../common/Common.module.css";
import { ContextApp } from "../../context/ContextAppState";
import { useSwapService } from "../../context/ContextSwapService";
import ScrollPaneTop from "../scrollPane/ScrollPane";
import Utils from "../../utils/utils";
import { native } from "../../electronBridge";
import {
  SwapDirectionEnum,
  extractFiatValueBasis,
  formatAmountForDisplay,
  providerShortLabel,
  validateAddressForChain,
} from "../../swap";
import type { FiatValueBasisType, QuoteInput, RouteOptionType, TokenEntryType } from "../../swap";
import { ZEC_ASSET, isQuotableToken, tokenToSwapAsset } from "./swapAssets";
import SwapExecute from "./SwapExecute";
import TokenLogo from "./TokenLogo";
import AssetPicker from "./AssetPicker";
import QuotesPicker from "./QuotesPicker";
import SlippagePicker, { formatSlippagePercent } from "./SlippagePicker";
import InsufficientFunds from "./InsufficientFunds";

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
  sendSwapDeposit: (args: {
    depositAddress: string;
    amountAtomic: number;
    memoBytes?: Uint8Array;
    routeViaEphemeral?: boolean;
  }) => Promise<string[]>;
};

const Swap: React.FC<SwapProps> = ({ sendSwapDeposit }) => {
  const { totalBalance, currentWallet, info, readOnly } = useContext(ContextApp);
  const swapService = useSwapService();

  const [direction, setDirection] = useState<SwapDirectionEnum>(() =>
    (totalBalance?.totalSpendableBalance ?? 0) > 0 ? SwapDirectionEnum.Outbound : SwapDirectionEnum.Inbound,
  );
  const isOutbound = direction === SwapDirectionEnum.Outbound;

  const [tokens, setTokens] = useState<TokenEntryType[] | null>(null);
  const [catalogError, setCatalogError] = useState<string>("");
  const [selectedToken, setSelectedToken] = useState<TokenEntryType | null>(null);

  const [amount, setAmount] = useState<string>("");
  const [counterpartyAddress, setCounterpartyAddress] = useState<string>("");
  const [addressValid, setAddressValid] = useState<boolean>(true);

  // Reserved once per swap intent and reused across re-quotes. The index is
  // burned in the wallet even if the user walks away, which costs a BIP32
  // child slot and nothing else.
  const [ephemeralAddress, setEphemeralAddress] = useState<string>("");

  const [routes, setRoutes] = useState<RouteOptionType[] | null>(null);
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
  const [pickerOpen, setPickerOpen] = useState<boolean>(false);
  const [quotesOpen, setQuotesOpen] = useState<boolean>(false);
  const [slippageOpen, setSlippageOpen] = useState<boolean>(false);
  const [slippageBps, setSlippageBps] = useState<number>(DEFAULT_SLIPPAGE_BPS);
  const [insufficientOpen, setInsufficientOpen] = useState<boolean>(false);

  const spendable = totalBalance?.totalSpendableBalance ?? 0;

  useEffect(() => {
    if (!swapService) return;
    let cancelled = false;
    (async () => {
      try {
        const catalog = (await swapService.listRoutableTokens(isOutbound ? "outbound" : "inbound")).filter(
          isQuotableToken,
        );
        if (cancelled) return;
        setTokens(catalog);
        setCatalogError("");
        setSelectedToken(catalog.find((t) => t.identifier === DEFAULT_TOKEN_IDENTIFIER) ?? catalog[0] ?? null);
      } catch (error) {
        if (cancelled) return;
        setTokens([]);
        setCatalogError(`${error}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [swapService, isOutbound]);

  // Only the changes that make a shown quote meaningless clear it: flipping
  // direction swaps which side is ZEC, and a different asset prices something
  // else entirely.
  //
  // The amount and the slippage are deliberately not here. They do produce a
  // fresh quote, but through the auto-fire below, which replaces the numbers
  // in place. Clearing here instead would blank the panel on every keystroke
  // and bring it back a second later.
  //
  // The addresses are not here either, and not in the quote's inputs: SwapKit
  // prices on assets, amount and slippage alone. They are read into the
  // pinned request when the user opens the review, which is the moment they
  // start to matter.
  useEffect(() => {
    setRoutes(null);
    setChosenRouteId("");
    setQuoteContext(null);
    setReviewing(false);
    setQuoteError("");
  }, [direction, selectedToken]);

  const counterpartyChain = selectedToken?.chain ?? "";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // The chain the address must belong to is the non-ZEC one when sending
      // out, and ZEC when receiving: the field means "where the funds land".
      const chain = isOutbound ? counterpartyChain : ZEC_ASSET.chain;
      const valid = await validateAddressForChain(chain, counterpartyAddress, currentWallet?.chain_name);
      if (!cancelled) setAddressValid(valid);
    })();
    return () => {
      cancelled = true;
    };
  }, [counterpartyAddress, counterpartyChain, isOutbound, currentWallet]);

  const amountNumber = parseFloat(amount.replace(",", "."));
  const amountValid = Number.isFinite(amountNumber) && amountNumber > 0;
  const overBalance = isOutbound && amountValid && amountNumber > spendable;

  // The quote needs an asset and an amount. The address is the review's
  // requirement, not the quote's.
  const canQuote = !!swapService && !!selectedToken && amountValid;
  const canReview = canQuote && !overBalance && counterpartyAddress.length > 0 && addressValid;

  const reserveEphemeral = useCallback(async (): Promise<string> => {
    if (ephemeralAddress) return ephemeralAddress;
    const raw: string = await native.reserve_ephemeral_address();
    const parsed = JSON.parse(raw) as { encoded_address?: string };
    if (!parsed.encoded_address) {
      throw new Error("the wallet reserved no address for this swap");
    }
    setEphemeralAddress(parsed.encoded_address);
    return parsed.encoded_address;
  }, [ephemeralAddress]);

  const requestQuote = useCallback(async () => {
    if (!swapService || !selectedToken) return;
    setQuoting(true);
    setQuoteError("");
    try {
      const ephemeral = await reserveEphemeral();
      const other = tokenToSwapAsset(selectedToken);
      const quoteInput: QuoteInput = {
        sellAsset: isOutbound ? ZEC_ASSET : other,
        receiveAsset: isOutbound ? other : ZEC_ASSET,
        // SwapKit reads a dot-separated decimal whatever the user's locale.
        sellAmountHumanDecimal: amount.replace(",", "."),
        // Placeholders on the wallet side only. SwapKit prices without
        // reading these, and the review materialises the real pair before
        // anything is committed.
        sourceAddress: isOutbound ? ephemeral : "",
        destinationAddress: isOutbound ? "" : ephemeral,
        slippageBps,
      };
      const result = await swapService.quote(quoteInput);
      // No route is a real answer about the market right now, not a glitch:
      // the amount sits below every provider's minimum, or the liquidity is
      // gone. Saying so beats leaving an empty panel to interpret.
      setQuoteError(result.routes.length === 0 ? "No route is available for this swap right now." : "");
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
      setQuoteContext(null);
    } finally {
      setQuoting(false);
    }
  }, [swapService, selectedToken, isOutbound, amount, slippageBps, reserveEphemeral]);

  // Quote as soon as there is something to quote, rather than waiting for a
  // press. The debounce is what makes that affordable: an amount typed digit
  // by digit settles into one request instead of one per keystroke.
  useEffect(() => {
    if (!canQuote || reviewing || quoting) return;
    const timer = setTimeout(() => requestQuote(), QUOTE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    //  is intentionally absent: it is rebuilt whenever the
    // amount changes, which would restart the debounce on every keystroke and
    // then fire immediately once it settled, defeating the delay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canQuote, reviewing, amount, slippageBps, selectedToken, direction]);

  const chosenRoute = useMemo(() => routes?.find((r) => r.routeId === chosenRouteId) ?? null, [routes, chosenRouteId]);

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
        <div className={cstyles.well} style={{ margin: "0 16px 16px" }}>
          <div className={cstyles.horizontalflex} style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div className={cstyles.large}>{isOutbound ? "ZEC → other asset" : "Other asset → ZEC"}</div>
            <button
              type="button"
              className={cstyles.primarybutton}
              onClick={() => setDirection(isOutbound ? SwapDirectionEnum.Inbound : SwapDirectionEnum.Outbound)}
            >
              Flip
            </button>
          </div>

          <div className={cstyles.padtopsmall}>
            <div className={`${cstyles.sublight} ${cstyles.small}`}>{isOutbound ? "Receive" : "Send"} asset</div>
            {catalogError && <div style={{ color: Utils.getCssVariable("--color-error") }}>{catalogError}</div>}
            {!tokens && !catalogError && <div>Loading the asset catalog...</div>}
            {tokens && tokens.length > 0 && (
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: "none",
                  border: "1px solid var(--color-primary)",
                  borderRadius: 4,
                  padding: "6px 10px",
                  color: "inherit",
                  cursor: "pointer",
                }}
              >
                <TokenLogo token={selectedToken} size={28} />
                <span>
                  {selectedToken?.ticker ?? "Choose"}{" "}
                  <span className={cstyles.sublight}>{selectedToken?.chain ?? ""}</span>
                </span>
              </button>
            )}
          </div>

          <div className={cstyles.padtopsmall}>
            <div className={`${cstyles.sublight} ${cstyles.small}`}>
              Amount in {isOutbound ? "ZEC" : (selectedToken?.ticker ?? "")}
            </div>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.0" />
            {isOutbound && (
              <div className={`${cstyles.sublight} ${cstyles.small}`}>
                Spendable: {spendable} {info.currencyName}
              </div>
            )}
            {overBalance && (
              <div style={{ color: Utils.getCssVariable("--color-error") }}>
                That is more than the spendable balance.
              </div>
            )}
          </div>

          <div className={cstyles.padtopsmall}>
            <div className={`${cstyles.sublight} ${cstyles.small}`}>
              {isOutbound ? `Your ${counterpartyChain} address` : "Your refund address on the source chain"}
            </div>
            <input
              value={counterpartyAddress}
              onChange={(e) => setCounterpartyAddress(e.target.value)}
              style={{ width: "100%" }}
            />
            {counterpartyAddress.length > 0 && !addressValid && (
              <div style={{ color: Utils.getCssVariable("--color-error") }}>
                That address does not look valid for this chain.
              </div>
            )}
          </div>

          <div className={cstyles.padtopsmall}>
            <div className={`${cstyles.sublight} ${cstyles.small}`}>Slippage tolerance</div>
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
          <div className={cstyles.well} style={{ margin: "0 16px 16px" }}>
            <div className={cstyles.horizontalflex} style={{ justifyContent: "space-between", alignItems: "baseline" }}>
              <div className={cstyles.large}>Routes</div>
              {/* The countdown is the honest reading of how old the rate is.
                  It stops while the review modal is open, because the quote
                  the user is confirming is the one they were shown. */}
              <div className={`${cstyles.sublight} ${cstyles.small}`}>
                {quoting
                  ? "Refreshing..."
                  : reviewing
                    ? "Paused while you review"
                    : `Refreshing in ${secondsToRefresh}s`}
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

            <div className={`${cstyles.center} ${cstyles.horizontalflex} ${cstyles.padtopsmall}`}>
              <button
                type="button"
                className={cstyles.primarybutton}
                disabled={routes.length < 2}
                onClick={() => setQuotesOpen(true)}
              >
                {routes.length < 2 ? "Only one route" : `Compare ${routes.length} routes`}
              </button>
              <button
                type="button"
                className={cstyles.primarybutton}
                disabled={!chosenRoute}
                onClick={() => (canReview ? setReviewing(true) : setInsufficientOpen(true))}
              >
                Review
              </button>
            </div>
          </div>
        )}

        {reviewing && chosenRoute && quoteContext && (
          <SwapExecute
            swapService={swapService}
            // The addresses are read in here, not at quote time: SwapKit
            // prices without them, and this is the first moment they bind
            // anything. Everything else stays as it was quoted.
            quoteInput={{
              ...quoteContext.quoteInput,
              sourceAddress: isOutbound ? ephemeralAddress : counterpartyAddress,
              destinationAddress: isOutbound ? counterpartyAddress : ephemeralAddress,
            }}
            route={chosenRoute}
            fiatValueBasis={quoteContext.fiatValueBasis}
            direction={direction}
            sendSwapDeposit={sendSwapDeposit}
            onDone={() => {
              setReviewing(false);
              setRoutes(null);
              setChosenRouteId("");
              setQuoteContext(null);
              // A fresh swap gets a fresh ephemeral address: reusing one across
              // two swaps would let the provider link them.
              setEphemeralAddress("");
            }}
          />
        )}
      </ScrollPaneTop>

      {insufficientOpen && (
        <InsufficientFunds
          spendable={spendable}
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
