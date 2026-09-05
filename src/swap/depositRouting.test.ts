import { needsEphemeralRoute, zecNetworkFeeReserve } from "./depositRouting";
import { SwapKitProviderEnum } from "./enums/SwapKitProviderEnum";

describe("needsEphemeralRoute", () => {
  // Maya and THORChain read the refund destination off the inbound
  // transaction's origin, which a shielded spend does not expose.
  it("is true for the providers that read the deposit's origin", () => {
    expect(needsEphemeralRoute(SwapKitProviderEnum.MayachainStreaming)).toBe(true);
    expect(needsEphemeralRoute(SwapKitProviderEnum.ThorchainStreaming)).toBe(true);
  });

  it("is false for the providers that bind refunds to the deposit address", () => {
    expect(needsEphemeralRoute(SwapKitProviderEnum.Near)).toBe(false);
    expect(needsEphemeralRoute(SwapKitProviderEnum.Flashnet)).toBe(false);
  });
});

describe("zecNetworkFeeReserve", () => {
  it("reserves for two transactions on the ephemeral route and one otherwise", () => {
    expect(zecNetworkFeeReserve(SwapKitProviderEnum.MayachainStreaming)).toBeCloseTo(
      2 * zecNetworkFeeReserve(SwapKitProviderEnum.Near),
      12,
    );
  });

  // The screen offers "reduce to this amount" from a figure this feeds, so a
  // reserve that drifted into the visible range of a balance would read as the
  // wallet losing money. Both stay well under a thousandth of a ZEC.
  it("stays small enough not to distort the amount offered to the user", () => {
    expect(zecNetworkFeeReserve(SwapKitProviderEnum.MayachainStreaming)).toBeLessThan(0.001);
    expect(zecNetworkFeeReserve(SwapKitProviderEnum.Near)).toBeGreaterThan(0);
  });

  // Erring high is the safe direction: too little walks the user into a
  // proposal that fails after the route is already committed at the provider.
  // ZIP 317 charges its 5000-zat marginal fee per logical action past a
  // two-action grace, so a single-transaction deposit cannot plausibly exceed
  // this.
  it("covers a realistic single-transaction deposit", () => {
    expect(zecNetworkFeeReserve(SwapKitProviderEnum.Near)).toBeGreaterThanOrEqual(0.0002);
  });

  it("lands on an exact zatoshi count, with no binary-fraction dust", () => {
    const zats = zecNetworkFeeReserve(SwapKitProviderEnum.Near) * 1e8;
    expect(Number.isInteger(Math.round(zats))).toBe(true);
    expect(Math.abs(zats - Math.round(zats))).toBeLessThan(1e-6);
  });
});
