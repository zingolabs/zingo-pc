import React, { useContext, useMemo, useState } from "react";
import Modal from "react-modal";
import dateformat from "dateformat";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy, faExternalLinkAlt } from "@fortawesome/free-solid-svg-icons";

import styles from "../history/History.module.css";
import cstyles from "../common/Common.module.css";
import { ServerChainNameEnum } from "../appstate";
import { ContextApp } from "../../context/ContextAppState";
import { useSwapService } from "../../context/ContextSwapService";
import { useCopy } from "../common/useCopy";
import { shell } from "../../electronBridge";
import Utils from "../../utils/utils";
import {
  SwapDirectionEnum,
  buildTrackerEntries,
  canRemoveSwap,
  formatAmountForDisplay,
  isPrePaymentStatus,
  isRealLegHash,
  isTerminalStatus,
  providerLongLabel,
  swapRowLabel,
} from "../../swap";
import type { SwapRecordType, TrackerEntryType } from "../../swap";
import { isEvmSourceChain, memoToHexCalldata } from "../../swap";
import DetailNavigator from "../history/components/DetailNavigator";
import DepositSlip from "./DepositSlip";
import FeesBreakdown from "./FeesBreakdown";

type SwapDetailModalProps = {
  record: SwapRecordType;
  /** Where this swap sits in the list History is showing, and how long it is. */
  index: number;
  length: number;
  /** Steps to the neighbouring row, whatever kind it turns out to be. */
  moveDetail: (delta: number) => void;
  modalIsOpen: boolean;
  closeModal: () => void;
  onRemove: (record: SwapRecordType) => void;
};

/**
 * The per-swap detail view, standing where `VtModal` stands for a zingolib
 * value transfer. The record is read from the live store on every render, so a
 * poller tick that advances the swap reaches an open view without a reopen.
 *
 * It carries the same stepper the transfer detail does. History owns the step,
 * so moving off a swap onto a transfer opens that one instead: the two views
 * behave as one list rather than as an island inside it.
 */
const SwapDetailModal: React.FC<SwapDetailModalProps> = ({
  record,
  index,
  length,
  moveDetail,
  modalIsOpen,
  closeModal,
  onRemove,
}) => {
  const {
    currentWallet,
    blockExplorerMainnetTransaction,
    blockExplorerTestnetTransaction,
    blockExplorerMainnetTransactionCustom,
    blockExplorerTestnetTransactionCustom,
    openConfirmModal,
  } = useContext(ContextApp);
  const swapService = useSwapService();
  const { copied, copy } = useCopy(1500);
  const [feesOpen, setFeesOpen] = useState<boolean>(false);
  const [attachHash, setAttachHash] = useState<string>("");
  const [attaching, setAttaching] = useState<boolean>(false);
  const [attachError, setAttachError] = useState<string>("");

  // Removing is destructive and irreversible, so it asks first — the same
  // treatment `VtModal` gives the equivalent action on a value transfer.
  //
  // A swap still waiting for payment gets a sharper warning: it may yet move,
  // and forgetting it is how a user loses sight of funds in flight. The
  // statuses that would make that dangerous outright — Completed, Pending,
  // Processing — never reach here, because `canRemoveSwap` hides the button.
  const confirmRemove = () => {
    closeModal();
    openConfirmModal(
      "Remove swap",
      isPrePaymentStatus(record.status)
        ? "This swap has not been paid yet. Removing it only forgets it here — if you do send the deposit later, this wallet will no longer track it. Continue?"
        : "This removes the swap from your history. The transactions themselves stay on-chain. Continue?",
      () => onRemove(record),
    );
  };

  const trackers: TrackerEntryType[] = useMemo(() => {
    const mainnet = currentWallet?.chain_name === ServerChainNameEnum.mainChainName;
    return buildTrackerEntries({
      record,
      zecChainName: currentWallet?.chain_name,
      zecBlockExplorer: mainnet ? blockExplorerMainnetTransaction : blockExplorerTestnetTransaction,
      zecBlockExplorerCustom: mainnet ? blockExplorerMainnetTransactionCustom : blockExplorerTestnetTransactionCustom,
    });
  }, [
    record,
    currentWallet,
    blockExplorerMainnetTransaction,
    blockExplorerTestnetTransaction,
    blockExplorerMainnetTransactionCustom,
    blockExplorerTestnetTransactionCustom,
  ]);

  const isOutbound = record.direction === SwapDirectionEnum.Outbound;
  const sellSymbol = record.sellAsset.ticker ?? record.sellAsset.chain ?? record.sellAsset.symbol;
  const receiveSymbol = record.receiveAsset.ticker ?? record.receiveAsset.chain ?? record.receiveAsset.symbol;
  const memo = (record.providerData as { memo?: string } | undefined)?.memo;

  // Every hash the record carries, filtered through `isRealLegHash`. Records
  // written by an older build can still hold an all-zero placeholder until the
  // next poller tick rewrites them, and a placeholder would render a row that
  // copies nothing and links nowhere.
  const hashRows: Array<{ label: string; value: string }> = [];
  if (isRealLegHash(record.observedDepositTxHash)) {
    hashRows.push({ label: "Deposit", value: record.observedDepositTxHash as string });
  }
  if (record.broadcast?.allTxIds && record.broadcast.allTxIds.length > 0) {
    record.broadcast.allTxIds.forEach((hop, index) => {
      if (!isRealLegHash(hop)) return;
      const isLast = index === (record.broadcast?.allTxIds?.length ?? 0) - 1;
      hashRows.push({ label: isLast ? "Broadcast" : `Broadcast hop ${index + 1}`, value: hop });
    });
  } else if (isRealLegHash(record.broadcast?.txId)) {
    hashRows.push({ label: "Broadcast", value: record.broadcast?.txId as string });
  }
  if (isRealLegHash(record.destinationTxHash)) {
    hashRows.push({ label: "Destination", value: record.destinationTxHash as string });
  }

  const removable = canRemoveSwap(record.status);

  // A deposit the provider can see is what turns a reserved swap into a
  // tracked one. Outbound gets it from our own broadcast, inbound from the
  // hash the user pasted or from Midgard. Until one exists the poller has
  // nothing to query, so this view has to be the place the user finishes the
  // job: the instructions to pay, and the way to hand back the transaction.
  const hasDepositEvidence = isRealLegHash(record.broadcast?.txId) || isRealLegHash(record.observedDepositTxHash);
  const awaitingDeposit = !isTerminalStatus(record.status) && !hasDepositEvidence;

  /**
   * Record the source-chain transaction that pays this deposit.
   *
   * The two directions write different fields: outbound goes through
   * `markBroadcasted`, which owns the broadcast block this wallet fills in,
   * and inbound through `setObservedDepositTxHash`, which is the slot for a
   * payment made from somewhere else. Both leave the record in a state the
   * poller will pick up on its next tick.
   *
   * Validation stays loose on purpose — a hash is chain-shaped and SwapKit
   * returns the authoritative error on `/track`. Rejecting the empty string is
   * the whole of it, plus trimming, because a pasted hash usually arrives with
   * whitespace around it.
   */
  const attachDeposit = async () => {
    const hash = attachHash.trim();
    if (!hash || !swapService) return;
    setAttaching(true);
    setAttachError("");
    try {
      if (isOutbound) {
        await swapService.markBroadcasted({ recordId: record.recordId, txId: hash });
      } else {
        await swapService.setObservedDepositTxHash({ recordId: record.recordId, hash });
      }
      setAttachHash("");
    } catch (error) {
      setAttachError(`${error}`);
    } finally {
      setAttaching(false);
    }
  };

  return (
    <Modal
      isOpen={modalIsOpen}
      onRequestClose={closeModal}
      className={styles.txmodal}
      overlayClassName={styles.txmodalOverlay}
    >
      <DetailNavigator index={index} length={length} move={moveDetail} />
      <div className={cstyles.verticalflex} style={{ height: "100%" }}>
        <div className={cstyles.center}>Swap Status</div>

        {/* The same header the transfer detail uses, and the arrow means the
            same thing it does there: down for value arriving, up for value
            leaving, read on the ZEC side because that is the side this wallet
            holds. The state sits under the icon where the transfer type sits,
            in plain text like that one. It needs no colour of its own to carry
            a failure, since it says "Swap failed" outright. */}
        <div
          className={`${cstyles.center} ${cstyles.horizontalflex}`}
          style={{ width: "100%", alignItems: "center", justifyContent: "center" }}
        >
          <div
            className={`${cstyles.center} ${cstyles.verticalflex}`}
            style={{ alignItems: "center", justifyContent: "center" }}
          >
            <i
              className={`${"fas"} ${isOutbound ? "fa-arrow-circle-up" : "fa-arrow-circle-down"}`}
              style={{
                fontSize: "35px",
                color: isOutbound ? Utils.getCssVariable("--color-text") : Utils.getCssVariable("--color-primary"),
              }}
            />
            {swapRowLabel(record.status)}
          </div>

          {/* Large rather than the transfer's headline size: this line carries
              two amounts and two tickers, and at 32px it wraps. The arrow
              follows the line rather than the direction, since what is sold is
              printed on the left in both cases. Amounts go through the
              formatter the History row uses, so a provider's 18-decimal string
              does not read as one number in the list and another here. */}
          <div
            className={`${cstyles.center} ${cstyles.large}`}
            style={{ marginLeft: 20, color: Utils.getCssVariable("--color-primary") }}
          >
            {formatAmountForDisplay(record.sellAmountHumanDecimal)} {sellSymbol} &rarr;{" "}
            {formatAmountForDisplay(record.actualReceiveAmount ?? record.expectedReceiveAmount)} {receiveSymbol}
          </div>
        </div>

        <div style={{ overflowY: "auto", overflowX: "hidden", flexGrow: 1, marginTop: 15 }}>
          {/* First, because when it applies it is the only thing on this
              screen the user can act on. Everything below is a record of what
              was agreed; this is what still has to happen. */}
          {awaitingDeposit && (
            <>
              <SectionHeader label={isOutbound ? "This deposit is unpaid" : "Pay this deposit"} />
              <DepositSlip
                provider={record.provider}
                direction={record.direction}
                sellAsset={record.sellAsset}
                depositAddress={record.depositAddress}
                amountHumanDecimal={record.sellAmountHumanDecimal}
                memoText={memo}
                copy={copy}
              />
              {swapService && (
                <div className={cstyles.padtopsmall}>
                  <div className={`${cstyles.sublight} ${cstyles.small}`}>
                    {isOutbound
                      ? "Already paid it from elsewhere? Paste the transaction id so tracking can resume."
                      : "Already paid it? Paste the transaction id from the wallet you paid from."}
                  </div>
                  <div className={cstyles.horizontalflex} style={{ alignItems: "center", gap: 8 }}>
                    <input
                      value={attachHash}
                      onChange={(e) => setAttachHash(e.target.value)}
                      placeholder="Transaction id"
                      style={{ flexGrow: 1 }}
                    />
                    <button
                      type="button"
                      className={cstyles.primarybutton}
                      disabled={attaching || attachHash.trim().length === 0}
                      onClick={attachDeposit}
                    >
                      {attaching ? "Working..." : "Attach"}
                    </button>
                  </div>
                  {!!attachError && (
                    <div className={cstyles.small} style={{ color: Utils.getCssVariable("--color-error") }}>
                      {attachError}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Laid out the way the transfer detail lays its own facts out: a
              rule, then a row of label-over-value columns. What was a stack of
              one-per-line rows under a heading is the same information in a
              third of the height. */}
          <hr style={{ width: "100%" }} />

          <div className={`${cstyles.flexspacebetween} ${cstyles.padtopsmall}`}>
            <Field label="Provider" value={providerLongLabel(record.provider)} />
            <Field label="Direction" value={isOutbound ? "Outbound" : "Inbound"} />
            {!!record.routeId && <Field label="Route id" value={record.routeId} />}
          </div>

          <div className={`${cstyles.flexspacebetween} ${cstyles.padtopsmall}`}>
            <Field label="Created" value={dateformat(record.createdAtMs, "mmm dd, yyyy HH:MM")} />
            {!!record.updatedAtMs && (
              <Field label="Updated" value={dateformat(record.updatedAtMs, "mmm dd, yyyy HH:MM")} />
            )}
          </div>

          <hr style={{ width: "100%" }} />

          <div className={`${cstyles.flexspacebetween} ${cstyles.padtopsmall}`}>
            <Field label="Sent" value={`${formatAmountForDisplay(record.sellAmountHumanDecimal)} ${sellSymbol}`} />
            <Field
              label="Expected"
              value={`${formatAmountForDisplay(record.expectedReceiveAmount)} ${receiveSymbol}`}
            />
            {!!record.minReceiveAmount && (
              <Field label="Minimum" value={`${formatAmountForDisplay(record.minReceiveAmount)} ${receiveSymbol}`} />
            )}
          </div>

          {/* No rule above it: a fee is an amount, so it belongs with the ones
              it was taken from rather than in a section of its own. */}
          {!!record.feesRaw?.length && (
            <div className={`${cstyles.flexspacebetween} ${cstyles.padtopsmall}`} style={{ alignItems: "flex-end" }}>
              <Field
                label="Total fees"
                value={`${formatAmountForDisplay(record.totalFeesInReceiveAsset)} ${receiveSymbol}`}
              />
              {/* The shared button reserves 8px on each side for sitting beside
                  another one. At the end of a row it has nothing to sit beside,
                  and that margin reads as the row stopping short. */}
              <button
                type="button"
                className={cstyles.primarybutton}
                style={{ marginRight: 0 }}
                onClick={() => setFeesOpen(true)}
              >
                Fee breakdown
              </button>
            </div>
          )}

          <SectionHeader label="Addresses" />
          {!!record.sourceAddress && <DetailRow label="From" value={record.sourceAddress} copy={copy} />}
          <DetailRow label="To" value={record.destinationAddress} copy={copy} />
          {/* Suppressed while the deposit slip is up: it carries the same
              address a few rows above, and two copies of one address invite
              the reader to wonder which is the real one. */}
          {!!record.depositAddress && !awaitingDeposit && (
            <DetailRow label="Deposit" value={record.depositAddress} copy={copy} />
          )}

          {hashRows.length > 0 && (
            <>
              <SectionHeader label="Transactions" />
              {hashRows.map((row) => (
                <DetailRow key={row.value} label={row.label} value={row.value} copy={copy} />
              ))}
            </>
          )}

          {/* Same reason as the deposit address above — the slip already shows
              the memo, its hex form, and where on this chain it has to go. */}
          {!!memo && !awaitingDeposit && (
            <>
              <SectionHeader label="Memo" />
              <DetailRow label="On-chain memo" value={memo} copy={copy} />
              {isEvmSourceChain(record.sellAsset.chain) && (
                <DetailRow label="Hex calldata" value={memoToHexCalldata(memo)} copy={copy} />
              )}
            </>
          )}

          {/* No heading and no rule: three buttons that open a tracker say what
              they are, and a rule under them was the last thing on the screen
              rather than a separator between two things. */}
          {trackers.length > 0 && (
            <div
              className={`${cstyles.horizontalflex} ${cstyles.margintoplarge}`}
              style={{ justifyContent: "center", flexWrap: "wrap" }}
            >
              {trackers.map((tracker) => (
                <button
                  key={tracker.key}
                  type="button"
                  className={cstyles.primarybutton}
                  onClick={() => shell.openExternal(tracker.url)}
                >
                  {tracker.label} &nbsp;
                  <FontAwesomeIcon icon={faExternalLinkAlt} />
                </button>
              ))}
            </div>
          )}
        </div>

        {copied && <div className={`${cstyles.center} ${cstyles.small}`}>Copied</div>}

        {/* Space rather than a rule. The buttons are the end of the screen, not
            the start of another section. */}
        <div className={`${cstyles.horizontalflex} ${cstyles.margintoplarge}`} style={{ justifyContent: "center" }}>
          {removable && (
            <button type="button" className={cstyles.primarybutton} onClick={confirmRemove}>
              Remove
            </button>
          )}
          <button type="button" className={cstyles.primarybutton} onClick={closeModal}>
            Cancel
          </button>
        </div>
      </div>

      {feesOpen && <FeesBreakdown record={record} modalIsOpen={feesOpen} closeModal={() => setFeesOpen(false)} />}
    </Modal>
  );
};

function SectionHeader({ label }: { label: string }) {
  return (
    <>
      <hr style={{ width: "100%" }} />
      <div className={`${cstyles.center} ${cstyles.sublight} ${cstyles.large} ${cstyles.padtopsmall}`}>{label}</div>
    </>
  );
}

/**
 * A fact in a row of them, labelled above rather than beside.
 *
 * The shape the transfer detail uses for the same job, so the two screens read
 * as one design. `DetailRow` below is the same label and the same value, given
 * its own line and a copy button, for the ones long enough to want both.
 */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className={cstyles.padtopsmall}>
      <div className={cstyles.sublight}>{label}</div>
      <div className={cstyles.breakword}>{value}</div>
    </div>
  );
}

function DetailRow({ label, value, copy }: { label: string; value: string; copy?: (value: string) => void }) {
  return (
    <div className={cstyles.padtopsmall}>
      <div className={cstyles.sublight}>{label}</div>
      <div className={cstyles.horizontalflex} style={{ alignItems: "center", gap: 8 }}>
        <div className={cstyles.breakword}>{value}</div>
        {copy && (
          <button
            type="button"
            aria-label={`Copy ${label}`}
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0 }}
            onClick={() => copy(value)}
          >
            <FontAwesomeIcon icon={faCopy} />
          </button>
        )}
      </div>
    </div>
  );
}

export default SwapDetailModal;
