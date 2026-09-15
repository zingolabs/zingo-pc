import { Base64 } from "js-base64";

/**
 * A ZIP 321 payment request for one of this wallet's addresses: the `zcash:`
 * link another wallet opens, or scans, with the address, the amount and the
 * memo already filled in. The reader side is `parseZcashURITargets`.
 */

/** A Zcash memo holds 512 bytes. */
export const PAYMENT_REQUEST_MEMO_MAX_BYTES = 512;

/**
 * A title is a line of text over the code, not a letter: longer ones wrap into
 * a block and make the code denser to scan, since it rides in the link.
 */
export const PAYMENT_REQUEST_TITLE_MAX_CHARS = 80;

const MAX_ZEC = 21_000_000;
const AMOUNT_PATTERN = /^\d+(\.\d{1,8})?$/;

export type PaymentRequestErrors = {
  titleError: string | null;
  amountError: string | null;
  memoError: string | null;
};

const memoBytes = (memo: string): number => new TextEncoder().encode(memo).length;

/**
 * What stops these fields from making a request. The amount is in ZEC, as
 * the user types it: digits, at most eight decimals, above zero. A memo only
 * rides to a shielded address; ZIP 321 forbids one on a transparent address.
 */
export function validatePaymentRequest(args: {
  title?: string;
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

  const titleError: string | null =
    (args.title ?? "").trim().length > PAYMENT_REQUEST_TITLE_MAX_CHARS
      ? `The title is longer than ${PAYMENT_REQUEST_TITLE_MAX_CHARS} characters`
      : null;

  return { titleError, amountError, memoError };
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
 * base64url without padding, as ZIP 321 requires. The message is ZIP 321's
 * text for the payer's wallet to show, percent-encoded. Empty ones are left out.
 */
export function buildPaymentRequestUri(args: {
  address: string;
  amount: string;
  memo?: string;
  message?: string;
}): string {
  const params = [`amount=${normaliseAmount(args.amount)}`];
  if (args.memo) params.push(`memo=${Base64.encodeURI(args.memo)}`);
  const message = args.message?.trim();
  if (message) params.push(`message=${encodeURIComponent(message)}`);
  return `zcash:${args.address}?${params.join("&")}`;
}
