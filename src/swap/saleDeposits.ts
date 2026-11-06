import type ValueTransferClass from "../components/appstate/classes/ValueTransferClass";
import { ValueTransferKindEnum } from "../components/appstate/enums/ValueTransferKindEnum";
import { ValueTransferStatusEnum } from "../components/appstate/enums/ValueTransferStatusEnum";
import { BroadcastStatusEnum } from "./enums/BroadcastStatusEnum";
import { SwapDirectionEnum } from "./enums/SwapDirectionEnum";
import { SwapStatusEnum } from "./enums/SwapStatusEnum";
import type { SwapRecordType } from "./types/SwapRecordType";

/** A payment this wallet sent, as a sale's deposit would show in it. */
export type SentPaymentType = {
  txid: string;
  address: string;
  amountAtomic: number;
  timeMs: number;
};

/**
 * The wallet's clock and the record's can disagree by a little; a deposit
 * never leaves long before the sale it pays was made.
 */
const CLOCK_SLACK_MS = 10 * 60 * 1000;

export function sentPaymentsFrom(valueTransfers: readonly ValueTransferClass[]): SentPaymentType[] {
  return valueTransfers.flatMap((vt) =>
    vt.type === ValueTransferKindEnum.sent &&
    vt.status !== ValueTransferStatusEnum.failed &&
    !vt.swapRecordId &&
    vt.address
      ? [
          {
            txid: vt.txid,
            address: vt.address,
            amountAtomic: Math.round(vt.amount * 1e8),
            timeMs: vt.time * 1000,
          },
        ]
      : [],
  );
}

/** A sale whose deposit has no transaction tied to it yet. */
export function awaitsSaleDeposit(record: SwapRecordType): boolean {
  return (
    record.direction === SwapDirectionEnum.Outbound &&
    record.status === SwapStatusEnum.PendingDeposit &&
    !record.broadcast?.txId
  );
}

/**
 * Whether the payment is the sale's deposit: to its deposit address, of its
 * exact amount, after it was made. Maya and THORChain share a vault address
 * between swaps, and the amount tells their deposits apart.
 */
export function paysSale(record: SwapRecordType, payment: SentPaymentType): boolean {
  return (
    payment.address === record.depositAddress &&
    payment.amountAtomic === Math.round(parseFloat(record.sellAmountHumanDecimal) * 1e8) &&
    payment.timeMs >= record.createdAtMs - CLOCK_SLACK_MS
  );
}

/**
 * The sale once its deposit is its own, as if the send had reported it: a
 * deshield already kept goes first in the list.
 */
export function claimSaleDeposit(record: SwapRecordType, payment: SentPaymentType, nowMs: number): SwapRecordType {
  if (!awaitsSaleDeposit(record)) return record;
  const before = (record.broadcast?.allTxIds ?? []).filter((txid) => txid !== payment.txid);
  return {
    ...record,
    status: SwapStatusEnum.Pending,
    broadcast: {
      status: BroadcastStatusEnum.Broadcasted,
      txId: payment.txid,
      allTxIds: [...before, payment.txid],
      broadcastedAtMs: payment.timeMs,
    },
    updatedAtMs: nowMs,
  };
}
