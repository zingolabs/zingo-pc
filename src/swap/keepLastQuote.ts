import type { QuoteInput } from "./SwapService";
import type { RouteOptionType } from "./types/RouteOptionType";

/**
 * Whether a refresh that brought back no route should leave the routes on
 * screen in place rather than replace them with "no route".
 *
 * Flashnet's `estimate_unavailable` comes and goes on the same pair from one
 * quote to the next, and a pair only Flashnet routes flipped between a route
 * and an error every 20 seconds: "it was accepting it and suddenly dropped".
 * One failed refresh says little about a route that answered a moment ago.
 *
 * So the last routes stay while all of this holds:
 *   - the refresh asked the same question (a changed amount, asset, address or
 *     slippage deserves its own answer, whatever it is);
 *   - the last good answer is younger than STALE_QUOTE_GRACE_MS, so a gap
 *     that lasts is still reported, just not on the first blink;
 *   - some route on screen has not passed its own expiry, since committing an
 *     expired route is refused by the provider anyway.
 */
export const STALE_QUOTE_GRACE_MS = 60_000;

/** How soon a refresh that failed is tried again, instead of the full cycle. */
export const FAILED_REFRESH_RETRY_MS = 5_000;

/** The question a quote answers, as a comparable string. */
export function quoteQuestionKey(input: QuoteInput): string {
  return JSON.stringify([
    input.sellAsset.swapKitId,
    input.receiveAsset.swapKitId,
    input.sellAmountHumanDecimal,
    input.sourceAddress,
    input.destinationAddress,
    input.slippageBps,
  ]);
}

export function shouldKeepLastQuote(args: {
  /** The question the failed refresh asked. */
  questionKey: string;
  /** The question and time of the last answer that had routes, if any. */
  lastGood: { questionKey: string; atMs: number } | null;
  /** The routes on screen now. */
  shownRoutes: readonly RouteOptionType[] | null;
  nowMs: number;
}): boolean {
  const { questionKey, lastGood, shownRoutes, nowMs } = args;
  if (!lastGood || !shownRoutes?.length) return false;
  if (lastGood.questionKey !== questionKey) return false;
  if (nowMs - lastGood.atMs >= STALE_QUOTE_GRACE_MS) return false;
  return shownRoutes.some((route) => !route.expiresAtMs || route.expiresAtMs > nowMs);
}
