import { SwapStatusEnum } from "./enums/SwapStatusEnum";
import { hasDepositEvidence } from "./depositEvidence";
import { recordDeshieldTxId } from "./depositAfterDeshield";
import type { SwapRecordType } from "./types/SwapRecordType";

/**
 * Whether the user may delete a swap: only one where no money moved. An
 * expired or failed swap the provider never saw a deposit for, or a sale
 * whose ZEC never left the shielded pool. An awaited deposit expires on its
 * own, and a swap with a payment behind it stays, whatever its outcome, so
 * funds in motion are never hidden.
 */
export function canRemoveSwap(record: SwapRecordType): boolean {
  switch (record.status) {
    case SwapStatusEnum.PendingDeposit:
      return !recordDeshieldTxId(record);
    case SwapStatusEnum.Expired:
    case SwapStatusEnum.Failed:
      return !hasDepositEvidence(record) && !recordDeshieldTxId(record);
    default:
      return false;
  }
}
