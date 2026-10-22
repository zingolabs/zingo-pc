/**
 * A swap deposit whose first transaction, the deshield to the wallet's own
 * transparent address, went out and whose second, the OP_RETURN payment to
 * the vault, did not. Resuming finishes the deposit from the second step;
 * sending it again would deshield a second time for the same swap.
 */
export class DepositAfterDeshieldError extends Error {
  readonly deshieldTxId: string;
  /** The OP_RETURN transaction, when it was built but not transmitted. */
  readonly opReturnTxId?: string;

  constructor(message: string, deshieldTxId: string, opReturnTxId?: string) {
    super(message);
    this.name = "DepositAfterDeshieldError";
    this.deshieldTxId = deshieldTxId;
    this.opReturnTxId = opReturnTxId;
  }
}

/** The answer of `send_swap_deposit` or `resume_swap_deposit`. */
type DepositAnswer = {
  txids?: string[];
  error?: string;
  after_deshield?: { deshield_txid: string; op_return_txid?: string | null };
};

/**
 * The txids of a deposit answer, or the failure it carries: a failure after
 * the deshield as `DepositAfterDeshieldError`, any other as a plain `Error`.
 */
export function depositTxIds(answer: string): string[] {
  const parsed: DepositAnswer = JSON.parse(answer);
  if (parsed.after_deshield) {
    throw new DepositAfterDeshieldError(
      parsed.error ?? "the deposit stopped after its first transaction",
      parsed.after_deshield.deshield_txid,
      parsed.after_deshield.op_return_txid ?? undefined,
    );
  }
  if (parsed.error) {
    throw new Error(parsed.error);
  }
  return parsed.txids ?? [];
}
