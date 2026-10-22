import { DepositAfterDeshieldError, depositTxIds } from "./depositAfterDeshield";

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
