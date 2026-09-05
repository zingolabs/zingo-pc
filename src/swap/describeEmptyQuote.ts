import type { QuoteResponseType } from "./types/QuoteResponseType";

/**
 * Why a quote came back with no routes, in the user's terms.
 *
 * SwapKit answers 200 with an empty `routes[]` and a `providerErrors[]`
 * explaining each refusal, so this never travels the error path and the reason
 * would otherwise be dropped on the floor. The common case by far is an amount
 * under the provider minimums, and the response states the minimum outright —
 * telling the user "no route is available" when the truth is "add a bit more"
 * sends them looking for a fault that is not there.
 *
 * The largest minimum is the one quoted: a smaller one belongs to a provider
 * that would still refuse, so it would be an amount that does not fix
 * anything. When the providers disagree on why, or say nothing useful, this
 * falls back to the generic sentence rather than inventing a cause.
 */
export function describeEmptyQuote(response: QuoteResponseType, sellAssetTicker: string | undefined): string {
  // The catalog ships entries without a ticker, so the caller cannot promise
  // one. Naming no unit beats naming the wrong one.
  const unit = sellAssetTicker ? ` ${sellAssetTicker}` : "";
  const generic = "No route is available for this swap right now.";
  const errors = response.providerErrors ?? [];
  if (errors.length === 0) return generic;

  const tooSmall = errors.filter((e) => e.errorCode === "sellAssetAmountTooSmall");
  if (tooSmall.length !== errors.length) return generic;

  const minimums = tooSmall
    .map((e) => Number(e.minAmount))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => b - a);

  if (minimums.length === 0) {
    return `That amount is below the minimum every provider accepts for this pair.`;
  }
  // Trailing zeros dropped so 0.01068069 does not read as 0.010680690000.
  const largest = minimums[0].toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
  return `That amount is too small. The smallest amount that routes right now is about ${largest}${unit}.`;
}
