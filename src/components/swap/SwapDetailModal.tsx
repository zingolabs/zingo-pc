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
  SwapStatusEnum,
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
import DepositSlip from "./DepositSlip";
import FeesBreakdown from "./FeesBreakdown";

type SwapDetailModalProps = {
  record: SwapRecordType;
  modalIsOpen: boolean;
  closeModal: () => void;
  onRemove: (record: SwapRecordType) => void;
};

/**
 * The per-swap detail view, standing where `VtModal` stands for a zingolib
 * value transfer. The record is read from the live store on every render, so a
 * poller tick that advances the swap reaches an open view without a reopen.
 *
 * There is no previous/next navigator. Swaps are sparse next to transfers, and
 * stepping between two unrelated ones has little to offer.
 */
const SwapDetailModal: React.FC<SwapDetailModalProps> = ({ record, modalIsOpen, closeModal, onRemove }) => {
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
      <div className={cstyles.verticalflex} style={{ height: "100%" }}>
        <div
          className={`${cstyles.center} ${cstyles.xlarge} ${cstyles.padtopsmall}`}
          style={{ color: statusColor(record.status) }}
        >
          {swapRowLabel(record.status)}
        </div>
        {/* The arrow follows the line, not the direction. What is sold is
            printed on the left and what is received on the right for both
            directions, so pointing it back at the sold side on an inbound swap
            made the line read against itself. Amounts go through the same
            formatter the History row uses, so a provider's 18-decimal string
            does not read as a different number here than it does there. */}
        <div className={`${cstyles.center} ${cstyles.large} ${cstyles.padtopsmall}`}>
          {formatAmountForDisplay(record.sellAmountHumanDecimal)} {sellSymbol} &rarr;{" "}
          {formatAmountForDisplay(record.actualReceiveAmount ?? record.expectedReceiveAmount)} {receiveSymbol}
        </div>

        <div style={{ overflowY: "auto", flexGrow: 1, marginTop: 15 }}>
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

          <SectionHeader label="Details" />
          <DetailRow label="Provider" value={providerLongLabel(record.provider)} />
          <DetailRow label="Created" value={dateformat(record.createdAtMs, "mmm dd, yyyy HH:MM")} />
          {!!record.updatedAtMs && (
            <DetailRow label="Updated" value={dateformat(record.updatedAtMs, "mmm dd, yyyy HH:MM")} />
          )}
          <DetailRow label="Direction" value={isOutbound ? "Outbound" : "Inbound"} />
          {!!record.routeId && <DetailRow label="Route id" value={record.routeId} copy={copy} />}

          <SectionHeader label="Amounts" />
          <DetailRow label="Sent" value={`${record.sellAmountHumanDecimal} ${sellSymbol}`} />
          <DetailRow label="Expected" value={`${record.expectedReceiveAmount} ${receiveSymbol}`} />
          {!!record.minReceiveAmount && (
            <DetailRow label="Minimum" value={`${record.minReceiveAmount} ${receiveSymbol}`} />
          )}

          {!!record.feesRaw?.length && (
            <>
              <SectionHeader label="Fees" />
              <button type="button" className={cstyles.primarybutton} onClick={() => setFeesOpen(true)}>
                Fee breakdown
              </button>
            </>
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

          {trackers.length > 0 && (
            <>
              <SectionHeader label="Track this swap" />
              {trackers.map((tracker) => (
                <button
                  key={tracker.key}
                  type="button"
                  className={cstyles.primarybutton}
                  style={{ display: "block", marginBottom: 6 }}
                  onClick={() => shell.openExternal(tracker.url)}
                >
                  {tracker.label} &nbsp;
                  <FontAwesomeIcon icon={faExternalLinkAlt} />
                </button>
              ))}
            </>
          )}
        </div>

        {copied && <div className={`${cstyles.center} ${cstyles.small}`}>Copied</div>}

        <div className={`${cstyles.horizontalflex} ${cstyles.padtopsmall}`} style={{ justifyContent: "center" }}>
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

/**
 * Terminal failures take the same error colour History gives a failed
 * transfer, so the two surfaces agree on what "this did not succeed" looks
 * like. `IncompleteDeposit` stays on the warning hue: the provider holds the
 * funds and will refund or accept a top-up, so reading it as lost would be
 * wrong.
 */
function statusColor(status: SwapStatusEnum): string {
  switch (status) {
    case SwapStatusEnum.Completed:
      return Utils.getCssVariable("--color-primary");
    case SwapStatusEnum.Failed:
    case SwapStatusEnum.Refunded:
    case SwapStatusEnum.Expired:
      return Utils.getCssVariable("--color-error");
    case SwapStatusEnum.IncompleteDeposit:
      return Utils.getCssVariable("--color-warning");
    default:
      return Utils.getCssVariable("--color-text");
  }
}

function SectionHeader({ label }: { label: string }) {
  return (
    <>
      <hr style={{ width: "100%" }} />
      <div className={`${cstyles.sublight} ${cstyles.small} ${cstyles.padtopsmall}`}>{label}</div>
    </>
  );
}

function DetailRow({ label, value, copy }: { label: string; value: string; copy?: (value: string) => void }) {
  return (
    <div className={cstyles.padtopsmall}>
      <div className={`${cstyles.sublight} ${cstyles.small}`}>{label}</div>
      <div className={cstyles.horizontalflex} style={{ alignItems: "center", gap: 8 }}>
        <div style={{ wordBreak: "break-all" }}>{value}</div>
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
