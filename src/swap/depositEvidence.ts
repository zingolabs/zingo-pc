import { isRealLegHash } from "./providers/trackUpdateBase";
import type { SwapRecordType } from "./types/SwapRecordType";

/**
 * Whether the provider can already see a deposit for this swap: outbound from
 * our own broadcast, inbound from the source-chain hash the user pasted or
 * Midgard found. `isRealLegHash` because `/track` emits an all-zero
 * placeholder for a leg that has not landed.
 */
export function hasDepositEvidence(record: SwapRecordType): boolean {
  return isRealLegHash(record.broadcast?.txId) || isRealLegHash(record.observedDepositTxHash);
}
