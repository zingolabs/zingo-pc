import { SwapKitHttpError } from "./errors";
import { providerShortLabel } from "./providerLabels";
import type { SwapKitProviderEnum } from "./enums/SwapKitProviderEnum";

/**
 * Why starting a swap failed, in the user's terms.
 *
 * Committing asks the provider to stand by the route it quoted, and a
 * provider can refuse at that moment for reasons that say nothing about the
 * wallet: Flashnet answers `estimate_unavailable` on and off for the same
 * pair, and a rate limit or a route that has just expired read the same way.
 * Shown raw ("SwapKitHttpError: SwapKit swap HTTP 400: estimate_unavailable /
 * quoteError") it reads as a broken wallet and says nothing about what to do,
 * which is: take a fresh quote, or take another provider's route.
 */
export function describeCommitFailure(error: unknown, provider?: SwapKitProviderEnum): string {
  const who = provider ? providerShortLabel(provider) : "The provider";
  const raw = `${error instanceof SwapKitHttpError ? `${error.message} ${error.body}` : String(error)}`.toLowerCase();

  if (raw.includes("estimate_unavailable") || raw.includes("noroutesfound") || raw.includes("no route")) {
    return `${who} could not price this swap just now. Refresh the quote and try again, or take another route.`;
  }
  if (raw.includes("insufficientliquidity") || raw.includes("liquidity")) {
    return `${who} does not have the liquidity for this swap right now. Try a smaller amount, or another route.`;
  }
  if (raw.includes("expired") || raw.includes("quote not found") || raw.includes("route not found")) {
    return "That quote is no longer good. Refresh it and start the swap again.";
  }
  if (raw.includes("ratelimit") || raw.includes("rate limit") || raw.includes("429")) {
    return `${who} is refusing requests for the moment. Try again in a minute.`;
  }
  return `Could not start the swap: ${error}`;
}
