import { buildPaymentRequestUri, validatePaymentRequest, PAYMENT_REQUEST_MEMO_MAX_BYTES } from "./paymentRequest";

const valid = { amount: "1", memo: "", allowsMemo: true };

describe("validatePaymentRequest", () => {
  it("accepts an amount in ZEC with up to eight decimals", () => {
    expect(validatePaymentRequest({ ...valid, amount: "0.00000001" }).amountError).toBeNull();
    expect(validatePaymentRequest({ ...valid, amount: "12.5" }).amountError).toBeNull();
  });

  it.each([
    ["", "Enter an amount"],
    ["abc", "Use digits and at most 8 decimals"],
    ["1.123456789", "Use digits and at most 8 decimals"],
    ["1e3", "Use digits and at most 8 decimals"],
    ["-1", "Use digits and at most 8 decimals"],
    ["0", "The amount must be above zero"],
    ["21000001", "The amount is too large"],
  ])("refuses the amount %p", (amount, error) => {
    expect(validatePaymentRequest({ ...valid, amount }).amountError).toBe(error);
  });

  // ZIP 321: a memo is only valid for a shielded address.
  it("refuses a memo for a transparent address", () => {
    expect(validatePaymentRequest({ ...valid, memo: "hi", allowsMemo: false }).memoError).toMatch(/transparent/);
    expect(validatePaymentRequest({ ...valid, memo: "", allowsMemo: false }).memoError).toBeNull();
  });

  // Counted in bytes, not characters: an emoji is four.
  it("refuses a memo over 512 bytes", () => {
    expect(validatePaymentRequest({ ...valid, memo: "a".repeat(PAYMENT_REQUEST_MEMO_MAX_BYTES) }).memoError).toBeNull();
    expect(validatePaymentRequest({ ...valid, memo: "✨".repeat(171) }).memoError).toMatch(/512 bytes/);
  });
});

describe("buildPaymentRequestUri", () => {
  it("writes the amount without leading or trailing zeros", () => {
    expect(buildPaymentRequestUri({ address: "u1abc", amount: "0010.2500" })).toBe("zcash:u1abc?amount=10.25");
    expect(buildPaymentRequestUri({ address: "u1abc", amount: "3.000" })).toBe("zcash:u1abc?amount=3");
    expect(buildPaymentRequestUri({ address: "u1abc", amount: "0.5" })).toBe("zcash:u1abc?amount=0.5");
  });

  // base64url without padding: no '+', '/' or '='.
  it("encodes the memo as unpadded base64url", () => {
    const uri = buildPaymentRequestUri({ address: "u1abc", amount: "1", memo: "??>>" });
    const memo = uri.split("memo=")[1];
    expect(memo).not.toMatch(/[+/=]/);
  });
});
