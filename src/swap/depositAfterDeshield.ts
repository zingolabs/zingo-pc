import { BroadcastStatusEnum } from "./enums/BroadcastStatusEnum";
import type { SwapRecordType } from "./types/SwapRecordType";

/**
 * A swap deposit that involves a deshield already sent: the first
 * transaction, the deshield to the wallet's own transparent address, went out
 * and the second, the OP_RETURN payment to the vault, did not.
 *
 * `failed` is the deposit just sent, and resuming finishes it from the second
 * step; sending it again would deshield a second time for the same swap.
 * `pending` is a refusal: an earlier deposit waits to resume, and
 * `deshieldTxId` is that one's, which may belong to another swap.
 */
export class DepositAfterDeshieldError extends Error {
  readonly kind: "failed" | "pending";
  readonly deshieldTxId: string;
  /** The OP_RETURN transaction, when it was built but not transmitted. */
  readonly opReturnTxId?: string;

  constructor(message: string, kind: "failed" | "pending", deshieldTxId: string, opReturnTxId?: string) {
    super(message);
    this.name = "DepositAfterDeshieldError";
    this.kind = kind;
    this.deshieldTxId = deshieldTxId;
    this.opReturnTxId = opReturnTxId;
  }
}

/** The answer of `send_swap_deposit` or `resume_swap_deposit`. */
type DepositAnswer = {
  txids?: string[];
  error?: string;
  after_deshield?: { kind?: "failed" | "pending"; deshield_txid: string; op_return_txid?: string | null };
};

/**
 * The txids of a deposit answer, or the failure it carries: one after a
 * deshield as `DepositAfterDeshieldError`, any other as a plain `Error`.
 */
export function depositTxIds(answer: string): string[] {
  const parsed: DepositAnswer = JSON.parse(answer);
  if (parsed.after_deshield) {
    throw new DepositAfterDeshieldError(
      parsed.error ?? "the deposit stopped after its first transaction",
      parsed.after_deshield.kind ?? "failed",
      parsed.after_deshield.deshield_txid,
      parsed.after_deshield.op_return_txid ?? undefined,
    );
  }
  if (parsed.error) {
    throw new Error(parsed.error);
  }
  return parsed.txids ?? [];
}

/** The deshield txid in the answer of `pending_swap_deposit`, if one waits. */
export function pendingDeshieldTxId(answer: string): string | undefined {
  const parsed: { deshield_txid?: string | null } = JSON.parse(answer);
  return parsed.deshield_txid ?? undefined;
}

/** The deshield of a sale whose deposit stopped after it, if this one did. */
export function recordDeshieldTxId(record: SwapRecordType): string | undefined {
  const broadcast = record.broadcast;
  if (broadcast?.status !== BroadcastStatusEnum.PendingBroadcast || broadcast.txId) return undefined;
  return broadcast.allTxIds?.[0];
}
