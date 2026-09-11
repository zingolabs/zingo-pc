import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import styles from "./Send.module.css";
import cstyles from "../common/Common.module.css";
import {
  AddressKindEnum,
  ToAddrClass,
  SendPageStateClass,
  ValueTransferClass,
  ServerChainNameEnum,
  ValueTransferStatusEnum,
  TotalBalanceClass,
} from "../appstate";
import { MAX_RECIPIENTS } from "../appstate/classes/SendPageStateClass";
import Utils from "../../utils/utils";
import { userFacingError } from "../../utils/userFacingError";
import ScrollPaneTop from "../scrollPane/ScrollPane";
import { usePaneOffset } from "../scrollPane/usePaneOffset";
import { BalanceBlockHighlight } from "../balanceBlock";
import { describeSendRoute } from "../../rpc/components/mixnetPresenter";
import { parseZcashURITargets, ZcashURITarget } from "../../utils/uris";
import SendManyJsonType from "./components/SendManyJSONType";
import ToAddrBox from "./components/ToAddrBox";
import SendConfirmModal from "./components/SendConfirmModal";
import RecipientStatusType from "./components/RecipientStatusType";
import { ContextApp } from "../../context/ContextAppState";

import { native } from "../../electronBridge";
import { ShieldBalance } from "../shieldBalance/ShieldBalance";
import { recipientsToSendManyJSON } from "./components/getSendManyJSON";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

const ZATS_PER_ZEC: number = 10 ** 8;

// ZIP 317's marginal fee: the most one more output can add to a transaction's
// fee. "Max" on a row leaves this much room for each of the other rows'
// outputs. An upper bound, so the figure errs toward a little left over rather
// than toward a batch that cannot be paid.
const MARGINAL_FEE_ZATS: number = 5_000;

// Long enough that typing an amount does not ask the wallet for a proposal on
// every keystroke.
const FEE_QUOTE_DEBOUNCE_MS: number = 300;

const toZats = (amount: number): number => (Number.isFinite(amount) ? Math.round(amount * ZATS_PER_ZEC) : 0);

const trimSpendable = (value: number): number => {
  const trimmed: number = Number(Utils.maxPrecisionTrimmed(value));
  return trimmed < 0 ? 0 : trimmed;
};

/**
 * What the wallet can send to `address`, fee included. With no address yet
 * there is nothing to price a fee against, so it is the spendable balance.
 */
async function calculateSpendable(
  address: string,
  totalSpendableBalance: number,
): Promise<{ spendable: number; error: string }> {
  // transparent funds are not spendable.
  if (!address) {
    return { spendable: trimSpendable(totalSpendableBalance), error: "" };
  }
  try {
    const result: string = await native.get_spendable_balance_with_address(address, "false");
    if (!result) {
      return { spendable: 0, error: "" };
    }
    const resultJSON = JSON.parse(result);
    const spendable: number = resultJSON.spendable_balance ? resultJSON.spendable_balance / ZATS_PER_ZEC : 0;
    return { spendable: trimSpendable(spendable), error: "" };
  } catch (error: any) {
    // Two audiences, two messages. The console keeps the context — which of
    // this screen's calls failed — because that is what a bug report needs.
    // The screen gets the wallet's own last clause, because the layers in
    // front of it describe how the renderer reaches the wallet and say
    // nothing about the user's money.
    console.error(`Critical Error calculate spendable ${error}`);
    return { spendable: 0, error: userFacingError(error) };
  }
}

/** The fee of the one transaction that pays every recipient. */
async function calculateSendFee(toaddrs: ToAddrClass[]): Promise<{ fee: number; error: string }> {
  try {
    const sendJson: SendManyJsonType[] = recipientsToSendManyJSON(toaddrs);
    const result: string = await native.send(JSON.stringify(sendJson));
    if (!result) {
      return { fee: 0, error: "" };
    }
    const resultJSON = JSON.parse(result);
    if (resultJSON.error) {
      return { fee: 0, error: resultJSON.error };
    }
    return { fee: resultJSON.fee ? resultJSON.fee / ZATS_PER_ZEC : 0, error: "" };
  } catch (error: any) {
    console.error(`Critical Error calculate send fee ${error}`);
    return { fee: 0, error: userFacingError(error) };
  }
}

type SendProps = {
  sendTransaction: (sendJson: SendManyJsonType[]) => Promise<string>;
  setSendPageState: (sendPageState: SendPageStateClass) => void;
  /** Files the recipient under a name, without leaving the screen. */
  addAddressBookEntry: (label: string, address: string, chain: ServerChainNameEnum, swapChain?: string) => void;
};

const Send: React.FC<SendProps> = ({ sendTransaction, setSendPageState, addAddressBookEntry }) => {
  const context = useContext(ContextApp);
  const {
    addressesUnified,
    sendPageState,
    info,
    totalBalance,
    readOnly,
    fetchError,
    valueTransfers,
    currentWallet,
    openConfirmModal,
    calculateShieldFee,
    zecPrice,
    mixnetView,
  } = context;

  // Both the route line and the button row sit under the pane, and the route
  // line wraps or does not depending on which of four sentences it is showing.
  // A constant could only be right for one of them.
  const { paneRef, footerRef, paneOffset } = usePaneOffset(308);

  const [modalIsOpen, setModalIsOpen] = useState<boolean>(false);
  const [sendFee, setSendFee] = useState<number>(0);
  const [sendFeeError, setSendFeeError] = useState<string>("");
  const [spendableError, setSpendableError] = useState<string>("");
  const [totalAmountAvailable, setTotalAmountAvailable] = useState<number>(0);
  const [tooltip, setTooltip] = useState<string>("");

  const [anyPending, setAnyPending] = useState<boolean>(false);
  const [shieldFee, setShieldFee] = useState<number>(0);

  // Each row's own verdict, keyed by the row's id.
  const [rowStatuses, setRowStatuses] = useState<{ [id: number]: RecipientStatusType }>({});
  // The row being edited. The others fold to one line.
  const [activeId, setActiveId] = useState<number | null>(null);

  const rows: ToAddrClass[] = sendPageState.toaddrs;
  const serverChainName: ServerChainNameEnum = currentWallet
    ? currentWallet.chain_name
    : ServerChainNameEnum.mainChainName;

  useEffect(() => {
    // set somePending as well here when I know there is something new in ValueTransfers
    const pending: number =
      valueTransfers.length > 0
        ? valueTransfers
            .filter((vt: ValueTransferClass) => vt.status !== ValueTransferStatusEnum.failed)
            .filter((vt: ValueTransferClass) => vt.confirmations >= 0 && vt.confirmations < 3).length
        : 0;
    setAnyPending(pending > 0);
  }, [valueTransfers]);

  useEffect(() => {
    if (totalBalance.confirmedTransparentBalance > 0 && calculateShieldFee && !readOnly && !anyPending) {
      (async () => {
        setShieldFee(await calculateShieldFee());
      })();
    }
  }, [totalBalance.confirmedTransparentBalance, anyPending, calculateShieldFee, readOnly]);

  useEffect(() => {
    let _tooltip: string = "";
    // set somePending as well here when I know there is something new in ValueTransfers
    const pending: number =
      valueTransfers.length > 0
        ? valueTransfers
            .filter((vt: ValueTransferClass) => vt.status !== ValueTransferStatusEnum.failed)
            .filter((vt: ValueTransferClass) => vt.confirmations >= 0 && vt.confirmations < 3).length
        : 0;
    // If there are unverified funds, then show a tooltip
    const unconfirmed: number = TotalBalanceClass.total(totalBalance) - TotalBalanceClass.confirmedTotal(totalBalance);
    const { bigPart, smallPart }: { bigPart: string; smallPart: string } =
      Utils.splitZecAmountIntoBigSmall(unconfirmed);

    if (unconfirmed > 0) {
      _tooltip = `Waiting for confirmation of ZEC ${bigPart + smallPart} with 3 block (approx 5 minutes)`;
    }
    if (unconfirmed === 0 && pending > 0) {
      _tooltip = `Waiting for confirmation with 3 block (approx 5 minutes)`;
    }
    setTooltip(_tooltip);
  }, [addressesUnified, totalBalance, valueTransfers]);

  // Asked about the first recipient whose address the wallet recognises: what
  // can be sent depends on where it goes, since a transparent destination
  // prices its fee differently. Keyed on that address alone, so typing amounts
  // does not refetch it.
  const spendableAddress: string =
    rows.find((r: ToAddrClass) => rowStatuses[r.id]?.addressKind !== undefined)?.to ?? "";

  useEffect(() => {
    let cancelled: boolean = false;
    (async () => {
      const { spendable, error } = await calculateSpendable(spendableAddress, totalBalance.totalSpendableBalance);
      if (cancelled) return;
      setTotalAmountAvailable(spendable);
      setSpendableError(error);
    })();
    return () => {
      cancelled = true;
    };
  }, [spendableAddress, totalBalance.totalSpendableBalance]);

  const totalZats: number = rows.reduce((sum: number, r: ToAddrClass) => sum + toZats(r.amount), 0);
  const totalAmount: number = totalZats / ZATS_PER_ZEC;
  const allRowsValid: boolean = rows.every((r: ToAddrClass) => rowStatuses[r.id]?.valid === true);
  // zip321 allows a zero-valued shielded output — a memo with no money in it is
  // a message — but refuses a zero-valued transparent one: "zero-valued
  // transparent outputs are disallowed by consensus". So the fee is quoted as
  // soon as the addresses are valid, except while a transparent recipient is
  // still at zero, where quoting would only bring that error back on the
  // keystroke that finished the address.
  const rowQuotable = (r: ToAddrClass): boolean => {
    if (r.amount > 0) {
      return true;
    }
    const kind: AddressKindEnum | undefined = rowStatuses[r.id]?.addressKind;
    return r.amount === 0 && (kind === AddressKindEnum.sapling || kind === AddressKindEnum.unified);
  };
  // A quote is harmless, a send is not. A row with no amount and no memo pays a
  // fee to deliver nothing — far more often a form left half filled than a
  // choice — so Send waits for one or the other.
  const rowCarriesSomething = (r: ToAddrClass): boolean => r.amount > 0 || !!(r.memo || r.memoReplyTo);
  const overCap: boolean = rows.length > MAX_RECIPIENTS;
  const batchOverSpendable: boolean = totalZats > toZats(totalAmountAvailable);
  // Another row while one has no address would only add an empty recipient.
  // Everything else a row can be missing — an amount, a memo, an amount that
  // does not parse — belongs to that row, shows in red on it, and does not stop
  // the batch from growing.
  const everyRowAddressed: boolean = rows.every((r: ToAddrClass) => !!r.to.trim());
  const quotable: boolean =
    allRowsValid && rows.every(rowQuotable) && !overCap && !batchOverSpendable && !spendableError;

  // One quote for the whole batch, because the fee belongs to the transaction
  // rather than to any recipient. Cleared before the wait, so the Send button
  // never offers a fee quoted for a batch that has changed since.
  useEffect(() => {
    setSendFee(0);
    setSendFeeError("");
    if (!quotable) return;
    let cancelled: boolean = false;
    const timer = setTimeout(async () => {
      const { fee, error } = await calculateSendFee(sendPageState.toaddrs);
      if (cancelled) return;
      setSendFee(fee);
      setSendFeeError(error);
    }, FEE_QUOTE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [sendPageState, quotable]);

  // A row that appears takes the focus: the one just added, or the last of the
  // several a payment request brought in.
  const previousRowCount = useRef<number>(rows.length);
  useEffect(() => {
    if (rows.length > previousRowCount.current) {
      setActiveId(rows[rows.length - 1].id);
    }
    previousRowCount.current = rows.length;
  }, [rows]);
  const activeRowId: number = rows.some((r: ToAddrClass) => r.id === activeId)
    ? (activeId as number)
    : rows[rows.length - 1].id;

  const setRowStatus = useCallback((id: number, status: RecipientStatusType) => {
    setRowStatuses((previous: { [id: number]: RecipientStatusType }) => {
      const current: RecipientStatusType | undefined = previous[id];
      if (current && current.valid === status.valid && current.addressKind === status.addressKind) {
        return previous;
      }
      return { ...previous, [id]: status };
    });
  }, []);

  const replaceRows = (toaddrs: ToAddrClass[]) => {
    const newState = new SendPageStateClass();
    newState.toaddrs = toaddrs.length > 0 ? toaddrs : [new ToAddrClass()];
    setSendPageState(newState);
  };

  // Rows are changed in place and the list handed back as a new state, the way
  // the single recipient always was: the card holds the same object, and reads
  // the new values off it.
  const updateRow = (id: number, change: (toaddr: ToAddrClass) => void) => {
    const toAddr: ToAddrClass | undefined = sendPageState.toaddrs.find((t: ToAddrClass) => t.id === id);
    if (!toAddr) return;
    change(toAddr);
    replaceRows(sendPageState.toaddrs.slice());
  };

  // A payment request pasted into a row fills that row with its first
  // recipient and adds the rest straight after it, in the request's order.
  const fillFromTargets = (id: number, targets: ZcashURITarget[]) => {
    const toaddrs: ToAddrClass[] = [];
    sendPageState.toaddrs.forEach((t: ToAddrClass) => {
      if (t.id !== id) {
        toaddrs.push(t);
        return;
      }
      targets.forEach((target: ZcashURITarget, i: number) => {
        const row: ToAddrClass = i === 0 ? t : new ToAddrClass();
        row.to = target.address ?? "";
        row.amount = target.amount ?? 0;
        row.memo = target.memoString ?? "";
        row.znsAlias = "";
        toaddrs.push(row);
      });
    });
    replaceRows(toaddrs);
  };

  const clearToAddrs = () => {
    setSendPageState(new SendPageStateClass());
    setRowStatuses({});
    setSendFee(0);
    setSendFeeError("");
  };

  // Clearing one recipient loses one line of typing. Clearing a batch loses
  // all of it, so that asks first.
  const requestClear = () => {
    const filled: number = rows.filter(ToAddrClass.hasContent).length;
    if (filled < 2) {
      clearToAddrs();
      return;
    }
    openConfirmModal("Clear Recipients", `Remove all ${filled} recipients from this send?`, clearToAddrs);
  };

  const addRecipient = () => {
    replaceRows([...sendPageState.toaddrs, new ToAddrClass()]);
  };

  const removeRecipient = (id: number) => {
    replaceRows(sendPageState.toaddrs.filter((t: ToAddrClass) => t.id !== id));
  };

  // Removing a recipient loses what was written into it, so that asks first.
  // An empty one has nothing to lose and goes straight away.
  const requestRemove = (toaddr: ToAddrClass, index: number) => {
    if (!ToAddrClass.hasContent(toaddr)) {
      removeRecipient(toaddr.id);
      return;
    }
    const who: string = toaddr.to ? ` (${toaddr.znsAlias || Utils.trimToSmall(toaddr.to, 5)})` : "";
    openConfirmModal("Remove Recipient", `Remove recipient ${index + 1}${who} from this send?`, () =>
      removeRecipient(toaddr.id),
    );
  };

  const updateToField = async (id: number, address: string | null, amount: string | null, memo: string | null) => {
    const toAddr: ToAddrClass | undefined = sendPageState.toaddrs.find((t: ToAddrClass) => t.id === id);
    if (!toAddr) return;
    if (address !== null) {
      // First, check if this is a URI
      const parsedUri: string | ZcashURITarget[] = await parseZcashURITargets(
        address.replace(/ /g, ""),
        serverChainName,
      );
      if (typeof parsedUri === "string") {
        if (!parsedUri || parsedUri.toLowerCase().startsWith("error")) {
          // with error leave the same value
          toAddr.to = address.replace(/ /g, ""); // Remove spaces
        } else {
          // if it is string with no error, it is an address
          toAddr.to = parsedUri;
        }
      } else {
        fillFromTargets(id, parsedUri);
        return;
      }
    }

    if (amount !== null) {
      // Check to see the new amount if valid
      const newAmount: number = parseFloat(amount);
      if (newAmount < 0 || newAmount > 21 * 10 ** 6) {
        return;
      }
      toAddr.amount = newAmount;
    }

    if (memo !== null) {
      toAddr.memo = memo;
    }

    replaceRows(sendPageState.toaddrs.slice());
  };

  const updateZnsAlias = (id: number, znsAlias: string) => {
    updateRow(id, (toAddr: ToAddrClass) => {
      toAddr.znsAlias = znsAlias;
    });
  };

  const setMaxAmount = (id: number, total: number) => {
    updateRow(id, (toAddr: ToAddrClass) => {
      toAddr.amount = Number(Utils.maxPrecisionTrimmed(total < 0 ? 0 : total));
    });
  };

  // What is left for one row: the spendable figure, less every other row's
  // amount, less room for the outputs those rows add to the fee.
  const maxForRow = (id: number): number => {
    const others: ToAddrClass[] = rows.filter((r: ToAddrClass) => r.id !== id);
    const othersZats: number = others.reduce((sum: number, r: ToAddrClass) => sum + toZats(r.amount), 0);
    const otherOutputs: number = recipientsToSendManyJSON(others.filter((r: ToAddrClass) => !!r.to)).length;
    const remainder: number = toZats(totalAmountAvailable) - othersZats - MARGINAL_FEE_ZATS * otherOutputs;
    return Math.max(0, remainder) / ZATS_PER_ZEC;
  };

  const duplicateOfIndex = (index: number): number | undefined => {
    const to: string = rows[index].to;
    if (!to) return undefined;
    const earlier: number = rows.findIndex((r: ToAddrClass) => r.to === to);
    return earlier < index ? earlier : undefined;
  };

  // Shielded outputs are encrypted, so an observer cannot tell who they pay or
  // how many there are. Transparent ones are public, and sharing a transaction
  // ties them to each other for anyone reading the chain.
  const transparentRecipients: number = rows.filter((r: ToAddrClass) => {
    const kind: AddressKindEnum | undefined = rowStatuses[r.id]?.addressKind;
    return kind === AddressKindEnum.transparent || kind === AddressKindEnum.tex;
  }).length;

  // One line for what stops the batch as a whole. A row's own problem stays on
  // the row; this is for the ones no single row is to blame for.
  let batchError: string = "";
  if (overCap) {
    batchError = `A send can carry up to ${MAX_RECIPIENTS} recipients. Remove ${rows.length - MAX_RECIPIENTS}.`;
  } else if (spendableError) {
    batchError = spendableError;
  } else if (rows.length > 1 && allRowsValid && batchOverSpendable) {
    batchError = "Total exceeds spendable funds";
  } else if (sendFeeError) {
    batchError = sendFeeError;
  }

  const canSend: boolean = quotable && sendFee > 0 && !sendFeeError && rows.every(rowCarriesSomething);

  const openModal = () => {
    setModalIsOpen(true);
  };

  const closeModal = () => {
    setModalIsOpen(false);
  };

  if (readOnly) {
    return (
      <div className={cstyles.well} style={{ textAlign: "center" }}>
        This is a only-watch wallet, it is imposible to spend/send the balance.
      </div>
    );
  }

  return (
    <div>
      <SendConfirmModal
        sendPageState={sendPageState}
        totalBalance={totalBalance}
        info={info}
        sendTransaction={sendTransaction}
        closeModal={closeModal}
        modalIsOpen={modalIsOpen}
        clearToAddrs={clearToAddrs}
        sendFee={sendFee}
        currencyName={info.currencyName}
      />

      <div className={`${cstyles.well} ${styles.containermargin}`}>
        <div className={cstyles.balancebox}>
          <BalanceBlockHighlight
            topLabel="All Funds"
            zecValue={TotalBalanceClass.total(totalBalance)}
            usdValue={Utils.getZecToUsdString(zecPrice, TotalBalanceClass.total(totalBalance))}
            currencyName={info.currencyName}
          />
          <BalanceBlockHighlight
            topLabel="Spendable Funds"
            zecValue={totalAmountAvailable}
            usdValue={Utils.getZecToUsdString(zecPrice, totalAmountAvailable)}
            currencyName={info.currencyName}
            tooltip={tooltip}
          />
        </div>
        <ShieldBalance shieldFee={shieldFee} anyPending={anyPending} />
        {!!fetchError && !!fetchError.error && (
          <>
            <hr />
            <div className={cstyles.balancebox} style={{ color: "var(--color-error)" }}>
              {fetchError.command + ": " + fetchError.error}
            </div>
          </>
        )}
      </div>

      <div className={`${cstyles.xlarge} ${cstyles.screentitle} ${cstyles.center}`}>Send</div>

      <div className={styles.horizontalcontainer}>
        <div className={cstyles.containermarginleft} ref={paneRef}>
          <ScrollPaneTop offsetHeight={paneOffset}>
            {rows.map((toaddr: ToAddrClass, index: number) => (
              <ToAddrBox
                key={toaddr.id}
                toaddr={toaddr}
                index={index}
                total={rows.length}
                collapsed={rows.length > 1 && toaddr.id !== activeRowId}
                onExpand={() => setActiveId(toaddr.id)}
                onRemove={rows.length > 1 ? () => requestRemove(toaddr, index) : undefined}
                duplicateOfIndex={duplicateOfIndex(index)}
                zecPrice={zecPrice}
                updateToField={(address, amount, memo) => updateToField(toaddr.id, address, amount, memo)}
                updateZnsAlias={(znsAlias) => updateZnsAlias(toaddr.id, znsAlias)}
                fromAmount={totalAmountAvailable}
                maxAmount={maxForRow(toaddr.id)}
                setMaxAmount={(total) => setMaxAmount(toaddr.id, total)}
                onStatusChange={(status) => setRowStatus(toaddr.id, status)}
                serverChainName={serverChainName}
                block={info.latestBlock >= info.walletHeight ? info.latestBlock : info.walletHeight}
                currencyName={info.currencyName}
                addAddressBookEntry={addAddressBookEntry}
              />
            ))}
            <div className={styles.addrecipient}>
              <button
                type="button"
                className={cstyles.primarybutton}
                disabled={rows.length >= MAX_RECIPIENTS || !everyRowAddressed}
                title={
                  rows.length >= MAX_RECIPIENTS
                    ? `Up to ${MAX_RECIPIENTS} recipients per send`
                    : everyRowAddressed
                      ? undefined
                      : "Give this recipient an address first"
                }
                onClick={addRecipient}
              >
                <FontAwesomeIcon icon={faPlus} /> Add recipient
              </button>
            </div>
          </ScrollPaneTop>
        </div>

        {/* Everything below the pane, measured as one: the pane may have the
            window less its own top and less all of this. */}
        <div ref={footerRef} style={{ paddingBottom: 10 }}>
          {/* Only there when something is wrong, so they cost no height the
              rest of the time. Full width, because a reason is a sentence. */}
          {!!batchError && (
            <div className={`${cstyles.red} ${cstyles.small} ${cstyles.center} ${cstyles.padtopsmall}`}>
              {batchError}
            </div>
          )}

          {transparentRecipients >= 2 && (
            <div className={`${cstyles.yellow} ${cstyles.small} ${cstyles.center} ${cstyles.padtopsmall}`}>
              {transparentRecipients} transparent recipients in one transaction are publicly linked to each other.
            </div>
          )}

          {/* One row: what the send costs, the buttons, and the route it will
              take. Three columns with equal sides, so the buttons stay centred
              however long either text runs; each side wraps inside its own. */}
          <div className={styles.sendfooter}>
            <div className={styles.sendfootersummary}>
              <div>
                {rows.length > 1 && <span>{rows.length} recipients · </span>}
                <span>
                  Total {info.currencyName} {Utils.maxPrecisionTrimmed(totalAmount)}
                </span>
                {info.currencyName === "ZEC" && (
                  <span className={cstyles.sublight}> ({Utils.getZecToUsdString(zecPrice, totalAmount)})</span>
                )}
              </div>
              <div>Fee {sendFee > 0 ? `${info.currencyName} ${Utils.maxPrecisionTrimmed(sendFee)}` : "—"}</div>
            </div>

            <div className={styles.sendfooterbuttons}>
              <button
                type="button"
                disabled={!canSend || mixnetView.sendBlocked}
                className={cstyles.primarybutton}
                onClick={openModal}
              >
                Send
              </button>
              <button type="button" className={cstyles.primarybutton} onClick={requestClear}>
                Clear
              </button>
            </div>

            {/* Always shown, and never in red — only two of the four states are
                a problem, and the other two are just the route the send will
                take. */}
            <div
              className={`${mixnetView.sendBlocked ? cstyles.yellow : cstyles.sublight} ${cstyles.small} ${styles.sendfooterroute}`}
            >
              {describeSendRoute(mixnetView)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Send;
