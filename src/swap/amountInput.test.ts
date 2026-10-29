import { parseAmountInput, toDottedDecimal } from "./amountInput";

describe("parseAmountInput", () => {
  it("reads a dot or a comma as the decimal separator", () => {
    expect(parseAmountInput("0.5")).toBe(0.5);
    expect(parseAmountInput(" 1,25 ")).toBe(1.25);
    expect(parseAmountInput(".5")).toBe(0.5);
  });

  // parseFloat took the leading number of each, and the text went to SwapKit.
  it.each(["0.5abc", "1.000,5", "1e-3", "1 000", "-1", ".", ""])("refuses %p", (text) => {
    expect(parseAmountInput(text)).toBeNaN();
  });
});

describe("toDottedDecimal", () => {
  it("writes a small amount without exponent notation", () => {
    expect(toDottedDecimal(0.0000001)).toBe("0.0000001");
    expect(toDottedDecimal(1.5)).toBe("1.5");
  });
});
