import { SwapKitProviderEnum } from "./enums/SwapKitProviderEnum";
import {
  DEFAULT_SLIPPAGE_BPS,
  MARKET_MOVE_HEADROOM_BPS,
  recommendedSlippageBps,
  repricesLateDeposits,
} from "./recommendedSlippage";

/**
 * The tolerance goes out with the quote, before any route is chosen, so one
 * number covers providers that behave differently. Flashnet reprices a late
 * deposit at the market rate and refunds anything past the tolerance; a Zcash
 * deposit is always late by its two-minute standard. This is what decides how
 * much room such a route is offered.
 */
describe("recommendedSlippageBps", () => {
  it("leaves a provider that honours its quote on the default", () => {
    expect(recommendedSlippageBps(SwapKitProviderEnum.Near)).toBe(DEFAULT_SLIPPAGE_BPS);
    expect(recommendedSlippageBps(SwapKitProviderEnum.MayachainStreaming, 250)).toBe(DEFAULT_SLIPPAGE_BPS);
  });

  it("gives a repricing provider room for the wait", () => {
    expect(recommendedSlippageBps(SwapKitProviderEnum.Flashnet)).toBe(MARKET_MOVE_HEADROOM_BPS);
  });

  // The route's own cost and the market move are different things spending the
  // same budget: a tolerance at the headroom alone would refuse a route that
  // already expects to cost more than that.
  it("adds the headroom on top of what the route already expects to cost", () => {
    expect(recommendedSlippageBps(SwapKitProviderEnum.Flashnet, 200)).toBe(200 + MARKET_MOVE_HEADROOM_BPS);
  });

  it("ignores a missing or nonsensical route figure", () => {
    expect(recommendedSlippageBps(SwapKitProviderEnum.Flashnet, undefined)).toBe(MARKET_MOVE_HEADROOM_BPS);
    expect(recommendedSlippageBps(SwapKitProviderEnum.Flashnet, 0)).toBe(MARKET_MOVE_HEADROOM_BPS);
    expect(recommendedSlippageBps(SwapKitProviderEnum.Flashnet, -50)).toBe(MARKET_MOVE_HEADROOM_BPS);
  });

  it("names only the provider that reprices", () => {
    expect(repricesLateDeposits(SwapKitProviderEnum.Flashnet)).toBe(true);
    expect(repricesLateDeposits(SwapKitProviderEnum.Near)).toBe(false);
    expect(repricesLateDeposits(SwapKitProviderEnum.MayachainStreaming)).toBe(false);
  });
});
