import ValueTransferClass from "../components/appstate/classes/ValueTransferClass";
import { ValueTransferKindEnum } from "../components/appstate/enums/ValueTransferKindEnum";
import { ValueTransferStatusEnum } from "../components/appstate/enums/ValueTransferStatusEnum";
import { SwapStatusEnum, isTerminalStatus } from "./enums/SwapStatusEnum";
import { SwapDirectionEnum } from "./enums/SwapDirectionEnum";
import { SwapRecordType } from "./types/SwapRecordType";

/**
 * Project a persistent `SwapRecord` into a `ValueTransferClass`-shaped row so
 * the existing History list can render it alongside the zingolib-reported
 * transactions without bespoke list machinery.
 *
 * The history list keys on `txid` for navigation/dedup, so we need one. For
 * outbound swaps with a broadcast we use the deposit tx hash (the last one of
 * the multi-step proposal); for inbound or pre-broadcast records we fall back
 * to the deposit address — this never collides with a real txid (txids are
 * 64 hex chars, deposit addresses for any of our chains are not).
 *
 * `type` is hardcoded to `ValueTransferKindEnum.swap`; the History UI dispatches
 * on this to pick an icon, colour and label dedicated to swaps. We do NOT
 * deduplicate against the matching outbound Sent VT in this iteration — the
 * user explicitly opted to see both rows so the underlying zingolib-reported
 * transactions remain visible (Sent + Swap side by side). A future pass can
 * walk `record.broadcast?.allTxIds` and elide the matching Sent rows.
 *
 * `amount` is always the sell-side amount (what leaves the wallet for outbound,
 * what arrives for inbound), in display units. `address` carries the
 * destination address of the swap — for outbound it's where the wrapped /
 * native asset lands, for inbound it's our ephemeral t-addr.
 */
export function swapRecordToValueTransfer(record: SwapRecordType): ValueTransferClass {
  const txid = record.broadcast?.txId ?? record.observedDepositTxHash ?? record.depositAddress;
  const isInbound = record.direction === SwapDirectionEnum.Inbound;
  // The row shows the side that is NOT ZEC, whichever direction the swap runs.
  //
  // The ZEC leg already has its own row beside this one: the deposit this
  // wallet broadcast for an outbound swap, the payout it received for an
  // inbound one. Those are zingolib's own transfers and are deliberately not
  // deduplicated away, so a swap row repeating the ZEC figure would say what
  // the row above it already said. The counterparty asset is the part of the
  // swap nothing else in the wallet can show.
  //
  // Outbound that is still moving carries the quote-time estimate, since the
  // provider has not reported a payout yet. The row's status label is what
  // says so.
  const counterpartyAsset = isInbound ? record.sellAsset : record.receiveAsset;
  const displayAmountStr = isInbound
    ? record.sellAmountHumanDecimal
    : (record.actualReceiveAmount ?? record.expectedReceiveAmount);
  const displayAmount = parseFloat(displayAmountStr);
  // Captured when the route was quoted, so the figure is what the swap was
  // worth when it ran rather than what that asset is worth today. Zero means
  // SwapKit priced neither side, and the renderers hide the column at zero
  // rather than print a number with nothing behind it.
  const counterpartyUsdUnitPrice = isInbound
    ? record.fiatValueBasis.sellUsdUnitPrice
    : record.fiatValueBasis.receiveUsdUnitPrice;

  return {
    txid,
    type: ValueTransferKindEnum.swap,
    fee: undefined,
    // Confirmations don't apply to a multi-step swap as a single value;
    // surfacing 0 keeps the existing display code happy (it short-circuits
    // when 0 to render "in progress"). SwapDetail pulls the per-tx
    // confirmations from the underlying record's hashes when needed.
    confirmations: isTerminalStatus(record.status) ? 1 : 0,
    blockheight: 0,
    time: Math.floor(record.createdAtMs / 1000),
    zec_price: undefined,
    address: record.destinationAddress,
    amount: Number.isFinite(displayAmount) ? displayAmount : 0,
    memos: undefined,
    poolsSentFrom: undefined,
    poolsReceived: undefined,
    status: mapSwapStatusToVTStatus(record.status),
    swapRecordId: record.recordId,
    swapIsInbound: isInbound,
    swapStatus: record.status,
    swapAssetTicker: counterpartyAsset.ticker ?? counterpartyAsset.symbol,
    swapUsdUnitPrice: counterpartyUsdUnitPrice,
  };
}

/**
 * Bridge from the rich `SwapStatusEnum` (10 values) to the legacy
 * `ValueTransferStatusEnum` (5 values). The mapping is intentionally
 * lossy — the History row only needs to know whether to colour the entry
 * neutral, success, or failure; the granular swap state is the detail
 * view's job to surface.
 */
function mapSwapStatusToVTStatus(status: SwapStatusEnum): ValueTransferStatusEnum {
  switch (status) {
    case SwapStatusEnum.Completed:
      return ValueTransferStatusEnum.confirmed;
    case SwapStatusEnum.Failed:
    case SwapStatusEnum.Refunded:
    case SwapStatusEnum.Expired:
      return ValueTransferStatusEnum.failed;
    case SwapStatusEnum.PendingDeposit:
    case SwapStatusEnum.AwaitingExternalDeposit:
      return ValueTransferStatusEnum.calculated;
    // `IncompleteDeposit` is intentionally treated as in-flight rather
    // than failed — the provider has the funds and will either refund
    // (transitioning to `Refunded`) or accept a top-up. Painting the row
    // coral would mislead the user into thinking the funds were lost.
    case SwapStatusEnum.IncompleteDeposit:
    case SwapStatusEnum.Pending:
    case SwapStatusEnum.Processing:
    case SwapStatusEnum.ProviderStatusUnknown:
    default:
      return ValueTransferStatusEnum.mempool;
  }
}

/**
 * Returns true when the swap originated funds *from* the wallet (outbound).
 * Used by the history filter to know which directional bucket the row falls
 * into when the user toggles "Sent" filter on — outbound swaps are
 * conceptually a Send.
 */
export function isOutboundSwap(record: SwapRecordType): boolean {
  return record.direction === SwapDirectionEnum.Outbound;
}
