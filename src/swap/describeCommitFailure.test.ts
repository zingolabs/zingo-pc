import { SwapOperationEnum } from "./enums/SwapErrorCategoryEnum";
import { SwapKitProviderEnum } from "./enums/SwapKitProviderEnum";
import { SwapKitHttpError } from "./errors";
import { describeCommitFailure } from "./describeCommitFailure";

const httpError = (body: string) => new SwapKitHttpError({ operation: SwapOperationEnum.Swap, httpStatus: 400, body });

describe("describeCommitFailure", () => {
  // The report: a Flashnet route reviewed and started, refused at that moment
  // with "HTTP 400: estimate_unavailable / quoteError" shown raw.
  it("says a provider could not price it, and what to do", () => {
    const message = describeCommitFailure(
      httpError('{"error":"quoteError","message":"estimate_unavailable"}'),
      SwapKitProviderEnum.Flashnet,
    );
    expect(message).toBe(
      "Flashnet could not price this swap just now. Refresh the quote and try again, or take another route.",
    );
  });

  it("names liquidity, an expired quote and a rate limit", () => {
    expect(describeCommitFailure(httpError('{"message":"Insufficient liquidity"}'), SwapKitProviderEnum.Near)).toMatch(
      /does not have the liquidity/,
    );
    expect(describeCommitFailure(httpError('{"message":"quote expired"}'))).toMatch(/no longer good/);
    expect(describeCommitFailure(httpError('{"message":"rate limited"}'), SwapKitProviderEnum.Near)).toMatch(
      /refusing requests/,
    );
  });

  it("falls back to the error itself when it says something else", () => {
    expect(describeCommitFailure(new Error("network down"))).toBe("Could not start the swap: Error: network down");
  });

  it("names no provider when the route did not say which", () => {
    expect(describeCommitFailure(httpError('{"message":"estimate_unavailable"}'))).toMatch(/^The provider could not/);
  });
});
