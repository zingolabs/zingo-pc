import { STALE_QUOTE_GRACE_MS, quoteQuestionKey, shouldKeepLastQuote } from "./keepLastQuote";
import type { QuoteInput } from "./SwapService";
import type { RouteOptionType } from "./types/RouteOptionType";

const asset = (swapKitId: string) => ({ swapKitId }) as QuoteInput["sellAsset"];
const input = (overrides: Partial<QuoteInput> = {}): QuoteInput => ({
  sellAsset: asset("ZEC.ZEC"),
  receiveAsset: asset("BSC.USDT-0X55D3"),
  sellAmountHumanDecimal: "0.1",
  sourceAddress: "t1source",
  destinationAddress: "0xdest",
  slippageBps: 100,
  ...overrides,
});
const route = (expiresAtMs?: number) => ({ routeId: "r", expiresAtMs }) as RouteOptionType;

const NOW = 1_000_000;
const key = quoteQuestionKey(input());
const lastGood = { questionKey: key, atMs: NOW - 20_000 };

describe("shouldKeepLastQuote", () => {
  // The Flashnet-only pair that flipped between a route and an error every
  // refresh: one failed answer must not wipe a route from a moment ago.
  it("keeps the routes on screen through one failed refresh of the same question", () => {
    expect(shouldKeepLastQuote({ questionKey: key, lastGood, shownRoutes: [route()], nowMs: NOW })).toBe(true);
  });

  it("lets a changed question have its own answer", () => {
    const other = quoteQuestionKey(input({ sellAmountHumanDecimal: "0.2" }));
    expect(shouldKeepLastQuote({ questionKey: other, lastGood, shownRoutes: [route()], nowMs: NOW })).toBe(false);
  });

  // A gap that lasts is still reported, just not on the first blink.
  it("stops keeping them once the last good answer is too old", () => {
    const old = { questionKey: key, atMs: NOW - STALE_QUOTE_GRACE_MS };
    expect(shouldKeepLastQuote({ questionKey: key, lastGood: old, shownRoutes: [route()], nowMs: NOW })).toBe(false);
  });

  it("does not keep routes that have all expired", () => {
    expect(shouldKeepLastQuote({ questionKey: key, lastGood, shownRoutes: [route(NOW - 1)], nowMs: NOW })).toBe(false);
    expect(
      shouldKeepLastQuote({ questionKey: key, lastGood, shownRoutes: [route(NOW - 1), route(NOW + 1)], nowMs: NOW }),
    ).toBe(true);
  });

  it("has nothing to keep without routes or a good answer", () => {
    expect(shouldKeepLastQuote({ questionKey: key, lastGood, shownRoutes: [], nowMs: NOW })).toBe(false);
    expect(shouldKeepLastQuote({ questionKey: key, lastGood: null, shownRoutes: [route()], nowMs: NOW })).toBe(false);
  });
});

describe("quoteQuestionKey", () => {
  it("changes with every input the quote depends on", () => {
    const base = quoteQuestionKey(input());
    expect(quoteQuestionKey(input({ slippageBps: 300 }))).not.toBe(base);
    expect(quoteQuestionKey(input({ destinationAddress: "0xother" }))).not.toBe(base);
    expect(quoteQuestionKey(input({ receiveAsset: asset("TRON.USDT-TR7") }))).not.toBe(base);
    expect(quoteQuestionKey(input())).toBe(base);
  });
});
