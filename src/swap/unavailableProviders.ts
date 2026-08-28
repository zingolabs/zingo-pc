import { SwapKitProviderEnum } from "./enums/SwapKitProviderEnum";
import { formatAmountForDisplay } from "./formatAmountForDisplay";
import type { QuoteProviderErrorType, QuoteResponseType } from "./types/QuoteResponseType";
import type { RouteOptionType } from "./types/RouteOptionType";

/** A provider that returned no route, and what it said about why. */
export type UnavailableProviderType = {
  provider: SwapKitProviderEnum;
  reason: string;
};

/**
 * The providers that did not offer a route, so the list can show them instead
 * of leaving their absence to be guessed at.
 *
 * SwapKit reports its refusals in the same response as the routes, and until
 * now they were read only when there were no routes at all. That left the
 * common case unexplained: one provider answers, the other two are missing,
 * and nothing on screen says whether the pair is unsupported or the amount is
 * simply below a minimum. The second is a swap the user can have by typing a
 * larger number, and they had no way to know it.
 *
 * Only the providers this wallet can actually execute are listed. SwapKit
 * refuses on behalf of a dozen it offers, and a list of routes that could
 * never have been taken teaches nothing.
 */
export function unavailableProviders({
  response,
  supported,
  routes,
  sellAssetTicker,
}: {
  response: QuoteResponseType;
  /** The providers with an executor — anything else is not a swap this app can make. */
  supported: readonly SwapKitProviderEnum[];
  /** The routes that did come back, whose providers are not missing. */
  routes: readonly RouteOptionType[];
  sellAssetTicker?: string;
}): UnavailableProviderType[] {
  const quoted = new Set(routes.map((route) => route.provider));
  const errors = new Map<string, QuoteProviderErrorType>();
  for (const error of response.providerErrors ?? []) {
    // SwapKit names the provider in the same casing as the enum, but a
    // response that shouts or whispers it should still match its refusal to
    // the provider it belongs to.
    if (error.provider) errors.set(error.provider.toUpperCase(), error);
  }

  return supported
    .filter((provider) => !quoted.has(provider))
    .map((provider) => ({
      provider,
      reason: describeRefusal(errors.get(provider.toUpperCase()), sellAssetTicker),
    }));
}

/**
 * One provider's refusal, in the user's terms.
 *
 * A missing entry is its own answer: SwapKit considered the pair and returned
 * neither a route nor a complaint, which means this provider does not trade
 * it. Saying so is honest; inventing a cause for it would not be.
 */
function describeRefusal(error: QuoteProviderErrorType | undefined, sellAssetTicker?: string): string {
  const unit = sellAssetTicker ? ` ${sellAssetTicker}` : "";
  if (!error) return "Does not trade this pair.";

  if (error.errorCode === "sellAssetAmountTooSmall") {
    const minimum = formatAmountForDisplay(error.minAmount);
    // A minimum of zero is the formatter saying it could not read one, not a
    // provider that accepts nothing.
    return minimum === "0" ? "The amount is below this provider's minimum." : `Needs at least ${minimum}${unit}.`;
  }

  // The provider's own words when it gave any. They are written for a
  // developer rather than a user, but a specific sentence beats a vague one,
  // and paraphrasing an error code we have never seen would be a guess.
  return error.message?.trim() || "Not available for this swap right now.";
}
