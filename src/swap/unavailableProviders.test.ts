import { SwapKitProviderEnum } from "./enums/SwapKitProviderEnum";
import { unavailableProviders } from "./unavailableProviders";
import type { QuoteResponseType } from "./types/QuoteResponseType";
import type { RouteOptionType } from "./types/RouteOptionType";

const SUPPORTED = [
  SwapKitProviderEnum.MayachainStreaming,
  SwapKitProviderEnum.Near,
  SwapKitProviderEnum.Flashnet,
] as const;

const response = (providerErrors?: QuoteResponseType["providerErrors"]): QuoteResponseType => ({
  routes: [],
  providerErrors,
});

const route = (provider: SwapKitProviderEnum): RouteOptionType =>
  ({ routeId: `route-${provider}`, provider }) as RouteOptionType;

describe("unavailableProviders", () => {
  // The case that prompted this: NEAR answers, the other two do not, and the
  // screen offered no way to tell an unsupported pair from an amount that is
  // merely too small.
  it("names the supported providers that returned no route", () => {
    const result = unavailableProviders({
      response: response([
        { provider: "MAYACHAIN_STREAMING", errorCode: "sellAssetAmountTooSmall", minAmount: "0.42" },
      ]),
      supported: SUPPORTED,
      routes: [route(SwapKitProviderEnum.Near)],
      sellAssetTicker: "ZEC",
    });

    expect(result).toEqual([
      { provider: SwapKitProviderEnum.MayachainStreaming, reason: "Needs at least 0.42 ZEC." },
      { provider: SwapKitProviderEnum.Flashnet, reason: "Does not trade this pair." },
    ]);
  });

  // A provider that answered is not missing, whatever else the response says
  // about it.
  it("leaves out a provider that returned a route", () => {
    const result = unavailableProviders({
      response: response(),
      supported: SUPPORTED,
      routes: [route(SwapKitProviderEnum.Near), route(SwapKitProviderEnum.Flashnet)],
    });

    expect(result.map((entry) => entry.provider)).toEqual([SwapKitProviderEnum.MayachainStreaming]);
  });

  // SwapKit refuses on behalf of a dozen providers this wallet has no executor
  // for. Listing routes that could never have been taken teaches nothing.
  it("ignores refusals from providers this app cannot execute", () => {
    const result = unavailableProviders({
      response: response([
        { provider: "THORCHAIN_STREAMING", errorCode: "sellAssetAmountTooSmall", minAmount: "5" },
        { provider: "UNISWAP_V3", message: "unsupported chain" },
      ]),
      supported: [SwapKitProviderEnum.Near],
      routes: [route(SwapKitProviderEnum.Near)],
    });

    expect(result).toEqual([]);
  });

  // The minimum is the actionable half of the answer: this swap is available,
  // for a larger number.
  it("quotes the minimum without a unit when the asset has no ticker", () => {
    const result = unavailableProviders({
      response: response([{ provider: "NEAR", errorCode: "sellAssetAmountTooSmall", minAmount: "0.01068069" }]),
      supported: [SwapKitProviderEnum.Near],
      routes: [],
    });

    expect(result[0].reason).toBe("Needs at least 0.01068069.");
  });

  // An unreadable minimum formats as zero, which would otherwise claim the
  // provider accepts nothing at all.
  it("does not report a minimum it could not read", () => {
    const result = unavailableProviders({
      response: response([{ provider: "NEAR", errorCode: "sellAssetAmountTooSmall" }]),
      supported: [SwapKitProviderEnum.Near],
      routes: [],
      sellAssetTicker: "ZEC",
    });

    expect(result[0].reason).toBe("The amount is below this provider's minimum.");
  });

  // Written for a developer rather than a user, but a specific sentence beats
  // a vague one and paraphrasing an unseen error code would be a guess.
  it("passes through the provider's own message for anything else", () => {
    const result = unavailableProviders({
      response: response([{ provider: "FLASHNET", errorCode: "somethingNew", message: "  pool is paused  " }]),
      supported: [SwapKitProviderEnum.Flashnet],
      routes: [],
    });

    expect(result[0].reason).toBe("pool is paused");
  });

  it("falls back to a plain sentence when the refusal says nothing useful", () => {
    const result = unavailableProviders({
      response: response([{ provider: "FLASHNET", errorCode: "somethingNew" }]),
      supported: [SwapKitProviderEnum.Flashnet],
      routes: [],
    });

    expect(result[0].reason).toBe("Not available for this swap right now.");
  });

  // The refusal has to reach the provider it belongs to even when SwapKit
  // shouts or whispers the name.
  it("matches a refusal to its provider whatever the casing", () => {
    const result = unavailableProviders({
      response: response([{ provider: "flashnet", errorCode: "sellAssetAmountTooSmall", minAmount: "1" }]),
      supported: [SwapKitProviderEnum.Flashnet],
      routes: [],
      sellAssetTicker: "ZEC",
    });

    expect(result[0].reason).toBe("Needs at least 1 ZEC.");
  });
});

describe("unavailableProviders across a provider's two forms", () => {
  const BOTH_MAYA = [SwapKitProviderEnum.MayachainStreaming, SwapKitProviderEnum.Mayachain] as const;

  // SwapKit counts streaming and single-shot as two providers. To the user
  // they are MayaChain, and two rows saying so would read as two failures.
  it("collapses them into one row", () => {
    const result = unavailableProviders({
      response: response(),
      supported: BOTH_MAYA,
      routes: [],
    });

    expect(result).toEqual([{ provider: SwapKitProviderEnum.MayachainStreaming, reason: "Does not trade this pair." }]);
  });

  // "Needs at least 0.42 ZEC" is worth reading; "does not trade this pair" is
  // what we say when nothing was said. The stated reason wins whichever form
  // it arrived on.
  it("keeps the form that gave a reason", () => {
    const result = unavailableProviders({
      response: response([{ provider: "MAYACHAIN", errorCode: "sellAssetAmountTooSmall", minAmount: "0.42" }]),
      supported: BOTH_MAYA,
      routes: [],
      sellAssetTicker: "ZEC",
    });

    expect(result).toEqual([{ provider: SwapKitProviderEnum.Mayachain, reason: "Needs at least 0.42 ZEC." }]);
  });

  // A route through single-shot Maya is a MayaChain route. Reporting the
  // streaming form as unavailable beside it would contradict the row above it.
  it("says nothing about a provider that quoted under its other form", () => {
    const result = unavailableProviders({
      response: response(),
      supported: BOTH_MAYA,
      routes: [route(SwapKitProviderEnum.Mayachain)],
    });

    expect(result).toEqual([]);
  });
});

describe("unavailableProviders and routes this app cannot take", () => {
  // The failure mode this exists to end: SwapKit offers a route, no executor
  // handles it, and it vanishes. On screen that is identical to the provider
  // never having answered, so the gap goes unnoticed indefinitely.
  it("reports a route dropped for want of an executor", () => {
    const result = unavailableProviders({
      response: response(),
      supported: [SwapKitProviderEnum.Near],
      routes: [route(SwapKitProviderEnum.Near)],
      unsupportedRoutes: [route(SwapKitProviderEnum.Chainflip)],
    });

    expect(result).toEqual([
      { provider: SwapKitProviderEnum.Chainflip, reason: "This wallet cannot swap through this provider yet." },
    ]);
  });

  // The refusal is the more specific fact, and two rows for one provider would
  // contradict each other.
  it("prefers a stated refusal over the dropped-route note", () => {
    const result = unavailableProviders({
      response: response([{ provider: "FLASHNET", errorCode: "sellAssetAmountTooSmall", minAmount: "1" }]),
      supported: [SwapKitProviderEnum.Flashnet],
      routes: [],
      unsupportedRoutes: [route(SwapKitProviderEnum.Flashnet)],
      sellAssetTicker: "ZEC",
    });

    expect(result).toEqual([{ provider: SwapKitProviderEnum.Flashnet, reason: "Needs at least 1 ZEC." }]);
  });

  // Streaming quoted, single-shot did not: the provider is available, and
  // saying otherwise beside a route the user can take would be nonsense.
  it("says nothing about a provider whose other form quoted", () => {
    const result = unavailableProviders({
      response: response(),
      supported: [SwapKitProviderEnum.MayachainStreaming],
      routes: [route(SwapKitProviderEnum.MayachainStreaming)],
      unsupportedRoutes: [route(SwapKitProviderEnum.Mayachain)],
    });

    expect(result).toEqual([]);
  });
});
