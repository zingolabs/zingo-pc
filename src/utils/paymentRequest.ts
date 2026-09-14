import { Base64 } from "js-base64";

/**
 * A ZIP 321 payment request for one of this wallet's addresses: the `zcash:`
 * link another wallet opens, or scans, with the address, the amount and the
 * memo already filled in. The reader side is `parseZcashURITargets`.
 */

/** A Zcash memo holds 512 bytes. */
export const PAYMENT_REQUEST_MEMO_MAX_BYTES = 512;

const MAX_ZEC = 21_000_000;
const AMOUNT_PATTERN = /^\d+(\.\d{1,8})?$/;

export type PaymentRequestErrors = { amountError: string | null; memoError: string | null };

const memoBytes = (memo: string): number => new TextEncoder().encode(memo).length;

/**
 * What stops these fields from making a request. The amount is in ZEC, as
 * the user types it: digits, at most eight decimals, above zero. A memo only
 * rides to a shielded address; ZIP 321 forbids one on a transparent address.
 */
export function validatePaymentRequest(args: {
  amount: string;
  memo: string;
  allowsMemo: boolean;
}): PaymentRequestErrors {
  const amount = args.amount.trim();
  let amountError: string | null = null;
  if (amount === "") {
    amountError = "Enter an amount";
  } else if (!AMOUNT_PATTERN.test(amount)) {
    amountError = "Use digits and at most 8 decimals";
  } else if (Number(amount) <= 0) {
    amountError = "The amount must be above zero";
  } else if (Number(amount) > MAX_ZEC) {
    amountError = "The amount is too large";
  }

  let memoError: string | null = null;
  if (args.memo !== "" && !args.allowsMemo) {
    memoError = "A transparent address cannot receive a memo";
  } else if (memoBytes(args.memo) > PAYMENT_REQUEST_MEMO_MAX_BYTES) {
    memoError = `The memo is longer than ${PAYMENT_REQUEST_MEMO_MAX_BYTES} bytes`;
  }

  return { amountError, memoError };
}

/**
 * The amount as ZIP 321 writes it: no leading zeros, no trailing decimal
 * zeros, no exponent.
 */
function normaliseAmount(amount: string): string {
  const [whole, fraction = ""] = amount.trim().split(".");
  const wholePart = whole.replace(/^0+(?=\d)/, "");
  const fractionPart = fraction.replace(/0+$/, "");
  return fractionPart ? `${wholePart}.${fractionPart}` : wholePart;
}

/**
 * The `zcash:` link for a request the fields above accept. The memo is
 * base64url without padding, as ZIP 321 requires; an empty memo is left out.
 */
export function buildPaymentRequestUri(args: { address: string; amount: string; memo?: string }): string {
  const params = [`amount=${normaliseAmount(args.amount)}`];
  if (args.memo) params.push(`memo=${Base64.encodeURI(args.memo)}`);
  return `zcash:${args.address}?${params.join("&")}`;
}
