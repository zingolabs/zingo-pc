/**
 * Compact user-facing formatter for swap amount strings.
 *
 * SwapKit and providers surface amounts as decimal strings with arbitrary
 * precision (sometimes 18+ decimals for EVM ERC20 conversions), which
 * overflows off narrow screens when rendered raw. This helper caps the
 * displayed precision and trims trailing zeros so `0.5` never renders as
 * `0.50000000`.
 *
 * Rules:
 *   - Missing input, unparseable input, and 0 all render as `"0"`.
 *   - Values ≥ 1 use up to 4 decimals, values < 1 up to 8.
 *   - Cut, never rounded: a guaranteed minimum must not read as more than
 *     the swap guarantees.
 *
 * **Do NOT** use this for values the user has to reproduce byte-for-byte:
 *   - The "Exact amount" row on channel-based providers (NEAR Intents,
 *     Flashnet) where any deviation causes a refund.
 *   - Anything copied to the clipboard for pasting into another app.
 * Those must keep the raw provider-supplied string. A provider's minimum
 * goes through `formatMinimumAmount`.
 */
export function formatAmountForDisplay(raw: string | undefined): string {
  const n = parseFloat(raw ?? "0");
  if (!Number.isFinite(n) || n === 0) return "0";
  const [whole, fraction] = Math.abs(n).toFixed(10).split(".");
  const cut = `${n < 0 ? "-" : ""}${whole}.${fraction.slice(0, Math.abs(n) >= 1 ? 4 : 8)}`;
  return cut.replace(/0+$/, "").replace(/\.$/, "");
}

/**
 * A provider's minimum to the zatoshi at any size (1.00064, not 1.0006), and
 * rounded up past the eighth decimal: a minimum shown lower than it is would
 * be refused again when the user enters it.
 */
export function formatMinimumAmount(minimum: number | string | undefined): string {
  const n = typeof minimum === "string" ? parseFloat(minimum) : minimum;
  if (n === undefined || !Number.isFinite(n) || n <= 0) return "0";
  const [whole, fraction] = n.toFixed(12).split(".");
  const zatoshi = BigInt(100000000);
  let units = BigInt(whole) * zatoshi + BigInt(fraction.slice(0, 8));
  if (/[1-9]/.test(fraction.slice(8))) units += BigInt(1);
  const text = `${units / zatoshi}.${(units % zatoshi).toString().padStart(8, "0")}`;
  return text.replace(/0+$/, "").replace(/\.$/, "");
}
