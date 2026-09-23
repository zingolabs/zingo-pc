/**
 * Whether a refused shield quote is the wallet saying "not yet".
 *
 * The Shield button exists when a quote comes back with a fee, so asking for
 * one is how the screen finds out whether shielding is possible at all. During
 * a scan the answer is often no — the transparent outputs, or the note that
 * pays the fee, have not been scanned yet — and zingolib says so the only way
 * a proposal can: insufficient funds, or a scan still required.
 *
 * That is an answer, not a failure, and it was being published on the same red
 * channel a real fault uses: "Shield: Change output generation failed:
 * Insufficient funds: required 10000 zatoshis, but only 0 zatoshis were
 * available", on a wallet with a transparent balance in plain sight, several
 * times over while it caught up. The screen already does the right thing with
 * it — no fee, no button — so the banner added nothing but alarm.
 *
 * Anything else a quote refuses with is still worth saying.
 */
const NOT_YET = [/insufficient funds/i, /scan\s*required/i];

export function shieldQuoteSaysNotYet(message: string): boolean {
  return NOT_YET.some((sign) => sign.test(message));
}
