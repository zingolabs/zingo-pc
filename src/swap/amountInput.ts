/**
 * Reads a typed or pasted amount, with a dot or a comma as the decimal
 * separator. NaN for anything else: `parseFloat` read "0.5abc" as 0.5 and
 * "1.000,5" as 1, and the text itself went on to SwapKit.
 */
export function parseAmountInput(text: string): number {
  const normalized = text.trim().replace(",", ".");
  return /^\d*\.?\d*$/.test(normalized) && normalized !== "" && normalized !== "." ? Number(normalized) : NaN;
}

/**
 * A number as the dot-separated decimal SwapKit reads, never in exponent
 * notation.
 */
export function toDottedDecimal(value: number): string {
  const plain = String(value);
  if (!/e/i.test(plain)) return plain;
  return value.toFixed(20).replace(/0+$/, "").replace(/\.$/, "");
}
