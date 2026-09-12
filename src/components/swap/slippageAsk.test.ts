import { describeSlippageAsk } from "./slippageAsk";

/**
 * The question asks the user to accept a larger possible loss to the market,
 * so it has to carry the trade it is offering: a wider tolerance against a
 * refund that arrives hours later having spent the deposit fee and delivered
 * nothing. Both percentages belong in it — the one they have and the one the
 * route wants — or there is nothing to decide between.
 */
describe("describeSlippageAsk", () => {
  it("states both tolerances and who is asking", () => {
    const text = describeSlippageAsk({ providerLabel: "Flashnet", currentBps: 100, neededBps: 450 });

    expect(text).toContain("Flashnet");
    expect(text).toContain("1%");
    expect(text).toContain("4.5%");
  });

  it("says what is lost by declining, not only what is risked by accepting", () => {
    const text = describeSlippageAsk({ providerLabel: "Flashnet", currentBps: 100, neededBps: 300 });

    expect(text).toMatch(/refunds/i);
    expect(text).toMatch(/deposit fee/i);
  });
});
