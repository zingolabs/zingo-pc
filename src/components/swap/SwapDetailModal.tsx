import React, { useContext, useEffect, useMemo, useState } from "react";
import Modal from "react-modal";
import dateformat from "dateformat";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowCircleDown, faArrowCircleUp, faExternalLinkAlt } from "@fortawesome/free-solid-svg-icons";

import styles from "../history/History.module.css";
import cstyles from "../common/Common.module.css";
import { ServerChainNameEnum } from "../appstate";
import { ContextApp } from "../../context/ContextAppState";
import { useSwapService } from "../../context/ContextSwapService";
import { useCopy } from "../common/useCopy";
import { shell } from "../../electronBridge";
import {
  SwapDirectionEnum,
  buildChainExplorerUrl,
  buildTrackerEntries,
  canRemoveSwap,
  describeRealizedSlippage,
  describeSlippageTolerance,
  formatAmountForDisplay,
  isPrePaymentStatus,
  isRealLegHash,
  isTerminalStatus,
  SwapStatusEnum,
  providerLongLabel,
  swapRowLabel,
} from "../../swap";
import type { SwapRecordType, TrackerEntryType } from "../../swap";
import { isEvmSourceChain, memoToHexCalldata } from "../../swap";
import { hashRowsForRecord } from "../../swap/hashRowsForRecord";
import DetailNavigator from "../history/components/DetailNavigator";
import DepositSlip from "./DepositSlip";
import FeesBreakdown from "./FeesBreakdown";
import { CopyField, Field, FieldRow } from "../common/DetailField";
import AdvancedSection from "../common/AdvancedSection";
import ProviderIcon from "./ProviderIcon";

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

  // A finished swap is no longer polled, so one that finished before the
  // tracker kept some detail never gets it. Ask once when it is shown. Keyed
  // on the record id rather than on opening: the arrows step to another swap
  // without remounting this view. What comes back reaches the screen through
  // the store, which History reads on every render.
  const shownRecordId = record.recordId;
  useEffect(() => {
    if (!modalIsOpen || !swapService) return;
    swapService
      .backfillFinishedRecord(shownRecordId)
      .catch((err) => console.log(`SwapDetailModal: backfill failed for ${shownRecordId}:`, err));
  }, [modalIsOpen, swapService, shownRecordId]);
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

  /**
   * The explorer for one of the transactions listed under Advanced, or null
   * where the chain publishes none we know of.
   *
   * A link belongs on the transaction it opens. It used to be a row of buttons
   * named after the leg they belonged to — "Source chain explorer", "Source
   * chain hop 1" — sitting apart from the hashes they were the links for, so
   * reading a two-hop deposit meant matching a button to a hash by name.
   */
  const explorerForHash = (row: { value: string; chain?: string }): string | null =>
    row.chain
      ? buildChainExplorerUrl({
          chain: row.chain,
          hash: row.value,
          zecChainName: currentWallet?.chain_name,
          zecBlockExplorer:
            currentWallet?.chain_name === ServerChainNameEnum.mainChainName
              ? blockExplorerMainnetTransaction
              : blockExplorerTestnetTransaction,
          zecBlockExplorerCustom:
            currentWallet?.chain_name === ServerChainNameEnum.mainChainName
              ? blockExplorerMainnetTransactionCustom
              : blockExplorerTestnetTransactionCustom,
        })
      : null;
  // A refund is one thing that happened, so it is reported in one place: the
  // reason, the transaction that brought the deposit back, and the way to it on
  // an explorer, together under the Refund heading. They used to be three:
  // the reason here, the hash among the transactions under Advanced and the
  // link among the trackers, so reading what became of the money meant
  // collecting it from three parts of the screen.
  const refundHash: string | undefined = isRealLegHash(record.refundInfo?.refundTxHash)
    ? (record.refundInfo?.refundTxHash as string)
    : undefined;
  const refundTracker: TrackerEntryType | undefined = trackers.find((tracker) => tracker.key === "refund-explorer");
  // What is left once every transaction carries its own link: the two that are
  // about the swap rather than about a transaction — SwapKit’s view of it and
  // the provider’s own order page.
  const routeTrackers: TrackerEntryType[] = trackers.filter(
    (tracker) => tracker.key === "swapkit" || tracker.key === "provider",
  );

  const isOutbound = record.direction === SwapDirectionEnum.Outbound;
  const sellSymbol = record.sellAsset.ticker ?? record.sellAsset.chain ?? record.sellAsset.symbol;
  const receiveSymbol = record.receiveAsset.ticker ?? record.receiveAsset.chain ?? record.receiveAsset.symbol;
  const memo = (record.providerData as { memo?: string } | undefined)?.memo;

  // The refund has its own place above, so it is not listed here as well.
  const uniqueHashRows = hashRowsForRecord(record).filter((row) => row.value !== refundHash);

  // What the provider said about an ending nobody asked for. A refund says it
  // in `refundInfo`, a failure in `failureReason`; both reached the record and
  // neither reached the screen.
  const endedBadlyReason = record.refundInfo?.refundReason ?? record.failureReason;

  const slippageTolerance = describeSlippageTolerance(record.requestedSlippageBps, record.slippageToleranceBps);
  const realizedSlippage = describeRealizedSlippage(record.realizedSlippageBps);

  // The reason is optional and a refund without one is common — SwapKit omits
  // `refundReason` when the provider gave none. Gating the section on the text
  // hid the whole ending in exactly that case, leaving a refunded swap looking
  // like one that had merely stopped. The status is what decides whether there
  // was an ending to report; the reason only decides how much it can say.
  const endedBadly: boolean =
    record.status === SwapStatusEnum.Refunded ||
    record.status === SwapStatusEnum.Failed ||
    record.status === SwapStatusEnum.Expired ||
    !!endedBadlyReason;

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
      overlayClassName={cstyles.modalOverlay}
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
            <FontAwesomeIcon
              icon={isOutbound ? faArrowCircleUp : faArrowCircleDown}
              style={{
                fontSize: "35px",
                color: isOutbound ? "var(--color-text)" : "var(--color-primary)",
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
            style={{ marginLeft: 20, color: "var(--color-primary)" }}
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
                    <div className={cstyles.fieldrow} style={{ flexGrow: 1 }}>
                      <input
                        className={cstyles.fieldinput}
                        value={attachHash}
                        onChange={(e) => setAttachHash(e.target.value)}
                        placeholder="Transaction id"
                      />
                    </div>
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
                    <div className={cstyles.small} style={{ color: "var(--color-error)" }}>
                      {attachError}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Laid out the way the transfer detail lays its own facts out: a
              rule, then rows of label-over-value columns. What was a stack of
              one-per-line rows under a heading is the same information in a
              third of the height.

              One rule, under the header. The two that used to sit between the
              rows separated nothing — each row is already a line of labelled
              values — and turned three readings of the same kind into three
              sections. Even space between them is what groups them now. */}
          <hr style={{ width: "100%" }} />

          <div className={cstyles.verticalflex} style={{ gap: 12 }}>
            <FieldRow>
              <Field
                label="Provider"
                value={
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <ProviderIcon provider={record.provider} size={16} decorative />
                    {providerLongLabel(record.provider)}
                  </span>
                }
              />
              <Field label="Direction" value={isOutbound ? "Outbound" : "Inbound"} />
              <Field label="Created" value={dateformat(record.createdAtMs, "mmm dd, yyyy HH:MM")} />
              {!!record.updatedAtMs && (
                <Field label="Updated" value={dateformat(record.updatedAtMs, "mmm dd, yyyy HH:MM")} />
              )}
            </FieldRow>

            {/* The amounts on one line, fees among them: a fee is an amount, so
              it belongs with the ones it was taken from rather than in a
              section of its own, and its breakdown opens from the row’s end. */}
            <FieldRow style={{ alignItems: "flex-end" }}>
              <Field label="Sent" value={`${formatAmountForDisplay(record.sellAmountHumanDecimal)} ${sellSymbol}`} />
              <Field
                label="Expected"
                value={`${formatAmountForDisplay(record.expectedReceiveAmount)} ${receiveSymbol}`}
              />
              {!!record.feesRaw?.length && (
                <Field
                  label="Total fees"
                  value={`${formatAmountForDisplay(record.totalFeesInReceiveAsset)} ${receiveSymbol}`}
                />
              )}
              {!!record.feesRaw?.length && (
                // The shared button reserves 8px on each side for sitting beside
                // another one. At the end of a row it has nothing to sit beside,
                // and that margin reads as the row stopping short.
                <button
                  type="button"
                  className={cstyles.primarybutton}
                  style={{ marginRight: 0 }}
                  onClick={() => setFeesOpen(true)}
                >
                  Fee breakdown
                </button>
              )}
            </FieldRow>

            {endedBadly && (
              <>
                <SectionHeader label={record.status === SwapStatusEnum.Refunded ? "Refund" : "Failure"} />
                <Field
                  label="Reason"
                  value={
                    endedBadlyReason ?? (
                      // Said rather than left blank: the user needs to know the
                      // silence is the provider's, not a value still loading, and
                      // where to go next. The provider's own order page sits in
                      // Advanced below and often carries more than /track does.
                      <span className={cstyles.sublight}>
                        Not given by {providerLongLabel(record.provider)}. Its order page, under Advanced below, may say
                        more.
                      </span>
                    )
                  }
                />
                {!!refundHash && (
                  <div
                    className={cstyles.flexspacebetween}
                    style={{ gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}
                  >
                    <CopyField label="Refund transaction" value={refundHash} copy={copy} />
                    {!!refundTracker && (
                      <button
                        type="button"
                        className={cstyles.primarybutton}
                        style={{ marginRight: 0 }}
                        onClick={() => shell.openExternal(refundTracker.url)}
                      >
                        View refund &nbsp;
                        <FontAwesomeIcon icon={faExternalLinkAlt} />
                      </button>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Where the swap paid, and the way to that payment on a block
                explorer. The address it left from, the deposit address and
                every hash along the way are the record of how it was done,
                and wait under Advanced. */}
            {/* "USDC address" said what kind of address it is and not what it
                is doing here. What it is doing here is where the swap paid, or
                where it paid this wallet. */}
            <CopyField
              label={`${isOutbound ? "Sent to" : "Received at"} (${receiveSymbol})`}
              value={record.destinationAddress}
              copy={copy}
            />
          </div>

          {/* Everything above answers what the swap was; this answers how it
            was carried out. A swap that went through leaves an order id, a
            route id, the addresses it passed through, a hash per leg and the
            slippage figures — the record that answers a dispute, and none of
            what the user opened this for. */}
          <AdvancedSection>
            <FieldRow>
              {!!record.routeId && <Field label="Route id" value={record.routeId} />}
              {!!record.providerOrderId && <CopyField label="Order id" value={record.providerOrderId} copy={copy} />}
            </FieldRow>

            {/* The minimum the swap guaranteed, the tolerance that set it and
                how the result compared with what was expected. Each is written
                only when the record carries it: swaps made before they were
                kept carry none of the three. */}
            {(!!record.minReceiveAmount || !!slippageTolerance || !!realizedSlippage) && (
              <FieldRow>
                {!!record.minReceiveAmount && (
                  <Field
                    label="Minimum"
                    value={`${formatAmountForDisplay(record.minReceiveAmount)} ${receiveSymbol}`}
                  />
                )}
                {!!slippageTolerance && <Field label="Slippage tolerance" value={slippageTolerance} />}
                {!!realizedSlippage && <Field label="Actual slippage" value={realizedSlippage} />}
              </FieldRow>
            )}

            {/* Not "Addresses", which read as the section every address lives
                in and left the one above it looking misplaced. These two are
                the route’s: an address this wallet derived to pay from, and the
                provider’s vault. Where the swap ended up is the user’s own
                business and stays in the plain view. */}
            <SectionHeader label="Route addresses" />
            {!!record.sourceAddress && <CopyField label="Paid from" value={record.sourceAddress} copy={copy} />}
            {/* Suppressed while the deposit slip is up: it carries the same
              address, and two copies of one address invite the reader to
              wonder which is the real one. */}
            {!!record.depositAddress && !awaitingDeposit && (
              <CopyField label="Deposit address" value={record.depositAddress} copy={copy} />
            )}

            {uniqueHashRows.length > 0 && (
              <>
                <SectionHeader label="Transactions" />
                {uniqueHashRows.map((row) => {
                  const url = explorerForHash(row);
                  return (
                    <div
                      key={`${row.label}-${row.value}`}
                      className={cstyles.flexspacebetween}
                      style={{ gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}
                    >
                      <CopyField label={row.label} value={row.value} copy={copy} />
                      {!!url && (
                        <button
                          type="button"
                          className={cstyles.primarybutton}
                          style={{ marginRight: 0 }}
                          onClick={() => shell.openExternal(url)}
                        >
                          View transaction &nbsp;
                          <FontAwesomeIcon icon={faExternalLinkAlt} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </>
            )}

            {/* Same reason as the deposit address above — the slip already
              shows the memo, its hex form, and where on this chain it has to
              go. */}
            {!!memo && !awaitingDeposit && (
              <>
                <SectionHeader label="Memo" />
                <CopyField label="On-chain memo" value={memo} copy={copy} />
                {isEvmSourceChain(record.sellAsset.chain) && (
                  <CopyField label="Hex calldata" value={memoToHexCalldata(memo)} copy={copy} />
                )}
              </>
            )}

            {/* The two links that are about the swap rather than about one of
                its transactions. Each transaction carries its own, above. */}
            {routeTrackers.length > 0 && (
              <div
                role="group"
                aria-label="Trackers"
                className={`${cstyles.horizontalflex} ${cstyles.margintoplarge}`}
                style={{ justifyContent: "center", flexWrap: "wrap", rowGap: 16 }}
              >
                {routeTrackers.map((tracker) => (
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
          </AdvancedSection>
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

export default SwapDetailModal;
