import { SwapOperationEnum } from "./enums/SwapErrorCategoryEnum";
import { SwapKitProviderEnum } from "./enums/SwapKitProviderEnum";
import { SwapKitHttpError } from "./errors";
import { describeCommitFailure, commitRefusalCondemnsRoute } from "./describeCommitFailure";

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

  // Also reported raw: "HTTP 400: xchain_source_route_unavailable /
  // quoteError" from a route that had just been quoted.
  it("says a provider has no route out of the asset being sold", () => {
    const message = describeCommitFailure(
      httpError('{"error":"quoteError","message":"xchain_source_route_unavailable"}'),
      SwapKitProviderEnum.Flashnet,
    );
    expect(message).toBe(
      "Flashnet has no route out of the asset you are selling just now. Take another route, or try again later.",
    );
  });

  it("names no provider when the route did not say which", () => {
    expect(describeCommitFailure(httpError('{"message":"estimate_unavailable"}'))).toMatch(/^The provider could not/);
  });
});

describe("commitRefusalCondemnsRoute", () => {
  // The provider answered about this route id. Asking again changes nothing.
  it("condemns the route when the provider refused it", () => {
    expect(commitRefusalCondemnsRoute(httpError('{"message":"xchain_source_route_unavailable"}'))).toBe(true);
  });

  // Nothing was heard from the provider at all, so the route is not the thing
  // that failed.
  it("leaves the route alone when the request never landed", () => {
    expect(commitRefusalCondemnsRoute(new Error("socket hang up"))).toBe(false);
  });
});
