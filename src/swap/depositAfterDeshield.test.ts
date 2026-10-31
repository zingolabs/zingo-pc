import {
  DepositAfterDeshieldError,
  depositTxIds,
  pendingDeshieldTxId,
  recordDeshieldTxId,
} from "./depositAfterDeshield";
import { BroadcastStatusEnum } from "./enums/BroadcastStatusEnum";
import type { SwapRecordType } from "./types/SwapRecordType";

const DESHIELD = "d".repeat(64);
const OP_RETURN = "e".repeat(64);

// The native deposit answers on the data channel: txids, a failure, or a
// failure after the deshield went out, which the swap screen resumes.
describe("depositTxIds", () => {
  it("answers the txids in order", () => {
    expect(depositTxIds(JSON.stringify({ txids: [DESHIELD, OP_RETURN] }))).toEqual([DESHIELD, OP_RETURN]);
  });

  it("throws a plain error for a failure before anything went out", () => {
    expect(() => depositTxIds(JSON.stringify({ error: "insufficient funds" }))).toThrow("insufficient funds");
  });

  it("throws DepositAfterDeshieldError with both txids when the deshield went out", () => {
    let thrown: unknown;
    try {
      depositTxIds(
        JSON.stringify({
          error: "OP_RETURN send failed after the deshield",
          after_deshield: { deshield_txid: DESHIELD, op_return_txid: OP_RETURN },
        }),
      );
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(DepositAfterDeshieldError);
    expect(thrown).toMatchObject({ deshieldTxId: DESHIELD, opReturnTxId: OP_RETURN });
  });

  it("leaves the OP_RETURN txid out when that step was never built", () => {
    expect(() =>
      depositTxIds(JSON.stringify({ error: "x", after_deshield: { deshield_txid: DESHIELD, op_return_txid: null } })),
    ).toThrow(expect.objectContaining({ deshieldTxId: DESHIELD, opReturnTxId: undefined }));
  });
});

describe("the kind of a deposit after a deshield", () => {
  it("reads `pending` when another deposit waits to resume", () => {
    expect(() =>
      depositTxIds(JSON.stringify({ error: "x", after_deshield: { kind: "pending", deshield_txid: DESHIELD } })),
    ).toThrow(expect.objectContaining({ kind: "pending", deshieldTxId: DESHIELD }));
  });

  it("reads `failed` for this deposit, and for an answer without a kind", () => {
    expect(() =>
      depositTxIds(JSON.stringify({ error: "x", after_deshield: { kind: "failed", deshield_txid: DESHIELD } })),
    ).toThrow(expect.objectContaining({ kind: "failed" }));
    expect(() => depositTxIds(JSON.stringify({ error: "x", after_deshield: { deshield_txid: DESHIELD } }))).toThrow(
      expect.objectContaining({ kind: "failed" }),
    );
  });
});

describe("pendingDeshieldTxId", () => {
  it("answers the deshield that waits, or nothing", () => {
    expect(pendingDeshieldTxId(JSON.stringify({ deshield_txid: DESHIELD }))).toBe(DESHIELD);
    expect(pendingDeshieldTxId(JSON.stringify({ deshield_txid: null }))).toBeUndefined();
  });
});

describe("recordDeshieldTxId", () => {
  const sale = (broadcast: SwapRecordType["broadcast"]) => ({ broadcast }) as SwapRecordType;

  it("names the deshield of a sale stopped after it", () => {
    expect(recordDeshieldTxId(sale({ status: BroadcastStatusEnum.PendingBroadcast, allTxIds: [DESHIELD] }))).toBe(
      DESHIELD,
    );
  });

  it("names nothing once the deposit went out, or before anything did", () => {
    expect(
      recordDeshieldTxId(
        sale({ status: BroadcastStatusEnum.Broadcasted, txId: OP_RETURN, allTxIds: [DESHIELD, OP_RETURN] }),
      ),
    ).toBeUndefined();
    expect(recordDeshieldTxId(sale({ status: BroadcastStatusEnum.PendingBroadcast }))).toBeUndefined();
  });
});
