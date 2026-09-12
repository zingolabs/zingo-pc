import { SwapStatusEnum, isTerminalStatus } from "../enums/SwapStatusEnum";
import { SwapRecordType } from "../types/SwapRecordType";
import { TrackResponseType } from "../types/TrackResponseType";
import { mapSwapStatus, mapTrackingStatus } from "./statusMapping";

/**
 * Default `/track` -> `SwapRecord` mutation shared by all provider executors.
 *
 * Most providers expose the same surface in SwapKit's normalised `/track`
 * response (top-level `status`, granular `trackingStatus`, `legs[]`). When an
 * executor has no provider-specific behaviour to add, it delegates here. When
 * it does, it can call this first to get the common mutations and then layer
 * provider-specific updates on top of the returned record.
 *
 * Behaviour:
 *   - Maps `status` and `trackingStatus` via the shared enum tables.
 *   - Picks inbound/outbound tx hashes from `legs[]`, preferring a match by
 *     `leg.chain` against the record's sell/receive chainIds. Falls back to a
 *     first-leg / last-leg heuristic when no leg carries a chain hint.
 *   - Stamps `firstObservedAtMs` on the first non-pre-broadcast observation
 *     and `terminalAtMs` on the transition into a terminal status.
 *   - Captures `failureReason` only when the new status is `Failed`, and the
 *     refund reason and refund transaction only when it is `Refunded`.
 *   - Keeps the provider order id whatever the outcome.
 */
export function applyDefaultTrackUpdate(record: SwapRecordType, response: TrackResponseType): SwapRecordType {
  const nowMs = Date.now();
  // mapSwapStatus returns undefined for unrecognised inputs — preserve
  // the current record.status in that case rather than collapsing to a
  // generic "Unknown". See `mapSwapStatus` for the rationale.
  const nextStatus = mapSwapStatus(response.status) ?? record.status;
  const nextTrackingStatus = mapTrackingStatus(response.trackingStatus);

  // Prefer a fresh leg hash from the response. If absent, keep the
  // existing record value ONLY when it itself passes the realness check
  // — that scrubs placeholders (empty / all-zero) that older ticks of
  // this same poller may have persisted before `pickLegHash` started
  // filtering them. Real hashes already on the record are not at risk
  // because they always pass the filter.
  const observedDepositTxHash =
    pickLegHash(response, "inbound", record.sellAsset.chainId) ??
    (isRealLegHash(record.observedDepositTxHash) ? record.observedDepositTxHash : undefined);
  const destinationTxHash =
    pickLegHash(response, "outbound", record.receiveAsset.chainId) ??
    (isRealLegHash(record.destinationTxHash) ? record.destinationTxHash : undefined);
  // Provider's actually-realised payout in the destination asset. SwapKit's
  // `/track` surfaces intermediate-leg amounts during multi-step swaps
  // (NEAR Intents, Mayachain streaming, etc.) — the top-level `toAmount`
  // may temporarily refer to a hop's intermediate asset rather than our
  // configured receive asset. Naively persisting whatever comes through
  // caused the History row to jitter between unrelated values (e.g. a
  // USDT-leg amount displayed as ZEC) before the swap converged on the
  // real destination amount. Guard the write: only accept `toAmount` when
  // `toAsset` matches the record's `receiveAsset.swapKitId`. Otherwise
  // keep the previous value (or fall back to the quote-time estimate via
  // `swapRecordToValueTransfer`).
  const toAssetMatches = typeof response.toAsset === "string" && response.toAsset === record.receiveAsset.swapKitId;
  const actualReceiveAmount =
    toAssetMatches && typeof response.toAmount === "string" && response.toAmount.length > 0
      ? response.toAmount
      : record.actualReceiveAmount;

  // Some providers (Flashnet, others to come) ship a deep-link URL into
  // their own dashboard — strictly richer than the SwapKit explorer
  // because it surfaces provider-specific state. Look for it both at
  // the top-level `meta.providerExplorerUrl` and inside any leg's
  // `meta.providerExplorerUrl`, accepting the first non-empty value.
  // Persisted on the record so the Trackers sheet still has the link
  // available after the swap reaches a terminal state and we stop
  // polling.
  const providerExplorerUrl = pickProviderExplorerUrl(response) ?? record.providerExplorerUrl;

  // Kept for every swap, not only a failed one: it is the name the provider
  // answers to about this order, and the moment it is wanted is the moment
  // the app can no longer reach the provider to ask.
  const providerOrderId = pickProviderOrderId(response) ?? record.providerOrderId;

  // A refund is the provider handing the deposit back and saying why. The
  // reason rides in `meta`, and the transaction that returned the funds is a
  // leg of its own on the chain the deposit came from — not the deposit leg,
  // which sits on that same chain and completed.
  const refundInfo = nextStatus === SwapStatusEnum.Refunded ? refundInfoFrom(record, response) : record.refundInfo;

  // Every other leg that has landed. A response with legs is the whole
  // current picture, so it replaces what the record held rather than adding
  // to it: a hash first taken for something else, while a later leg had not
  // yet appeared, must be able to move. Only a response with no legs at all
  // leaves the stored ones alone.
  const intermediateLegs = response.legs
    ? pickIntermediateLegs(response, [observedDepositTxHash, destinationTxHash, refundInfo?.refundTxHash])
    : record.intermediateLegs;

  // Slippage as SwapKit reports it once the swap settles. A partially
  // refunded swap measures against the full quoted amount, so its realised
  // figure reads as a large shortfall that is not slippage at all; SwapKit
  // says to check for that state, and the figure is not kept then.
  const finiteOr = (value: unknown, previous: number | undefined): number | undefined =>
    typeof value === "number" && Number.isFinite(value) ? value : previous;
  const slippageToleranceBps = finiteOr(response.slippageTolerance, record.slippageToleranceBps);
  const realizedSlippageBps =
    response.trackingStatus === "partially_refunded"
      ? record.realizedSlippageBps
      : finiteOr(response.realizedSlippageBps, record.realizedSlippageBps);

  const reachedTerminalNow = !isTerminalStatus(record.status) && isTerminalStatus(nextStatus);

  return {
    ...record,
    status: nextStatus,
    trackingStatus: nextTrackingStatus,
    observedDepositTxHash,
    destinationTxHash,
    slippageToleranceBps,
    realizedSlippageBps,
    intermediateLegs,
    actualReceiveAmount,
    providerExplorerUrl,
    providerOrderId,
    refundInfo,
    failureReason:
      nextStatus === SwapStatusEnum.Failed ? (response.failureReason ?? record.failureReason) : record.failureReason,
    firstObservedAtMs: record.firstObservedAtMs ?? nowMs,
    terminalAtMs: reachedTerminalNow ? nowMs : record.terminalAtMs,
    updatedAtMs: nowMs,
  };
}

/**
 * The landed legs that are neither the deposit, the delivery nor the refund.
 * Undefined when there are none, so a record does not carry an empty list.
 */
function pickIntermediateLegs(
  response: TrackResponseType,
  shown: ReadonlyArray<string | undefined>,
): ReadonlyArray<{ chainId: string; hash: string }> | undefined {
  const elsewhere = new Set(shown.filter(isRealLegHash));
  const legs = (response.legs ?? [])
    .filter((leg) => !!leg.chainId && isRealLegHash(leg.hash) && !elsewhere.has(leg.hash as string))
    .map((leg) => ({ chainId: leg.chainId as string, hash: leg.hash as string }));
  return legs.length > 0 ? legs : undefined;
}

/**
 * Look for a provider-supplied explorer URL in the `/track` response.
 * SwapKit emits it under `meta.providerExplorerUrl` (top-level) for some
 * providers and inside `legs[i].meta.providerExplorerUrl` for others
 * (e.g. Flashnet ships it on the swap-leg meta). Return the first
 * non-empty string found, or `undefined` when none is present.
 */
function pickProviderExplorerUrl(response: TrackResponseType): string | undefined {
  const topLevel = (response.meta as { providerExplorerUrl?: unknown })?.providerExplorerUrl;
  if (typeof topLevel === "string" && topLevel.length > 0) return topLevel;
  if (response.legs) {
    for (const leg of response.legs) {
      const legUrl = (leg.meta as { providerExplorerUrl?: unknown })?.providerExplorerUrl;
      if (typeof legUrl === "string" && legUrl.length > 0) return legUrl;
    }
  }
  return undefined;
}

/**
 * The provider order id, wherever this provider puts it: top-level `meta`
 * or the meta of whichever leg it runs. Flashnet ships it on the swap leg
 * beside the explorer URL.
 */
function pickProviderOrderId(response: TrackResponseType): string | undefined {
  const topLevel = (response.meta as { providerOrderId?: unknown })?.providerOrderId;
  if (typeof topLevel === "string" && topLevel.length > 0) return topLevel;
  if (response.legs) {
    for (const leg of response.legs) {
      const legId = (leg.meta as { providerOrderId?: unknown })?.providerOrderId;
      if (typeof legId === "string" && legId.length > 0) return legId;
    }
  }
  return undefined;
}

/**
 * What a refunded response adds to what the record already knew.
 *
 * Only the reason and the transaction: the amounts a refund reports are not
 * to be trusted. A real Flashnet refund came back with `toAmount: "0"` on
 * both the swap leg and the returning transfer while the deposit was in fact
 * returned in full, so a figure taken from there would understate what the
 * user got back. The record already holds what was deposited.
 */
function refundInfoFrom(record: SwapRecordType, response: TrackResponseType) {
  const refundReason = pickRefundReason(response) ?? record.refundInfo?.refundReason;
  const refundTxHash = pickRefundTxHash(response, record.sellAsset.chainId) ?? record.refundInfo?.refundTxHash;
  if (refundReason === undefined && refundTxHash === undefined) return record.refundInfo;
  return {
    ...record.refundInfo,
    ...(refundReason !== undefined && { refundReason }),
    ...(refundTxHash !== undefined && { refundTxHash }),
  };
}

/** The provider words for why it refunded, top level or on any leg. */
function pickRefundReason(response: TrackResponseType): string | undefined {
  const topLevel = (response.meta as { refundReason?: unknown })?.refundReason;
  if (typeof topLevel === "string" && topLevel.length > 0) return topLevel;
  if (response.legs) {
    for (const leg of response.legs) {
      const legReason = (leg.meta as { refundReason?: unknown })?.refundReason;
      if (typeof legReason === "string" && legReason.length > 0) return legReason;
    }
  }
  return undefined;
}

/**
 * The transaction that returned the funds: a refunded leg carrying a real
 * hash. The deposit leg sits on the same chain and would match a naive
 * chain-only search, so the refunded status is what selects it; the chain is
 * then preferred among several, because the funds come back where they left
 * from.
 */
function pickRefundTxHash(response: TrackResponseType, sellChainId: string): string | undefined {
  if (!response.legs) return undefined;
  const refunded = response.legs.filter((leg) => isRefundedLeg(leg.status) || isRefundedLeg(leg.trackingStatus));
  const onSellChain = refunded.find(
    (leg) => leg.chainId?.toLowerCase() === sellChainId.toLowerCase() && isRealLegHash(leg.hash),
  );
  if (onSellChain) return onSellChain.hash;
  return refunded.find((leg) => isRealLegHash(leg.hash))?.hash;
}

function isRefundedLeg(status: string | undefined): boolean {
  return status?.toLowerCase() === "refunded";
}

/**
 * Best-effort extraction of the source-chain (inbound) or destination-chain
 * (outbound) tx hash from a `/track` legs array.
 *
 * Strategy:
 *   1. If any leg carries a `chain` field that matches `targetChainId`
 *      (case-insensitive), use that leg's hash. This is the semantically
 *      correct path when SwapKit normalises `chain` consistently.
 *   2. Otherwise fall back to the positional heuristic — first leg for
 *      inbound, last leg for outbound — which has held empirically across the
 *      providers we have observed.
 *
 * Returns `undefined` when no legs are present.
 */
export function pickLegHash(
  response: TrackResponseType,
  role: "inbound" | "outbound",
  targetChainId: string,
): string | undefined {
  if (!response.legs || response.legs.length === 0) return undefined;

  // SwapKit emits the leg-level chain identifier as `chainId` and the tx
  // hash as `hash` (NOT `chain` / `txHash` — an earlier version of this
  // code used the wrong names and silently dropped every leg hash for
  // every provider). The check below treats empty strings AND the
  // all-zero placeholder (`0x0000…0000`, 66 chars) as "not yet landed"
  // so we never persist a sentinel that would show up as a dead
  // block-explorer link in the Trackers sheet.
  const target = targetChainId.toLowerCase();
  const matched = response.legs.find((leg) => leg.chainId !== undefined && leg.chainId.toLowerCase() === target);
  if (isRealLegHash(matched?.hash)) return matched!.hash;

  const fallback = role === "inbound" ? response.legs[0] : response.legs[response.legs.length - 1];
  if (isRealLegHash(fallback?.hash)) return fallback!.hash;
  return undefined;
}

/**
 * Whether a leg hash represents a real on-chain transaction rather than
 * SwapKit's "not yet landed" placeholder. Exported so the SwapDetail
 * Trackers sheet can apply the same filter when rendering rows from a
 * record persisted before this guard existed.
 */
export function isRealLegHash(hash: string | undefined): hash is string {
  if (!hash || hash.length === 0) return false;
  // SwapKit's placeholder for "leg not yet landed" is the zero-byte hash
  // serialised as either bare zeros or `0x`-prefixed zeros. Reject both.
  const stripped = hash.startsWith("0x") ? hash.slice(2) : hash;
  return !/^0+$/.test(stripped);
}
