import { formatAmountForDisplay, formatMinimumAmount } from "./formatAmountForDisplay";

describe("formatAmountForDisplay", () => {
  // A guaranteed minimum rounded up promised more than the swap guarantees.
  it("cuts instead of rounding", () => {
    expect(formatAmountForDisplay("1.23456")).toBe("1.2345");
    expect(formatAmountForDisplay("0.123456789")).toBe("0.12345678");
    expect(formatAmountForDisplay("2.99999")).toBe("2.9999");
  });

  it("drops trailing zeros and reads nothing as 0", () => {
    expect(formatAmountForDisplay("0.50000000")).toBe("0.5");
    expect(formatAmountForDisplay("12")).toBe("12");
    expect(formatAmountForDisplay(undefined)).toBe("0");
    expect(formatAmountForDisplay("abc")).toBe("0");
  });
});

describe("formatMinimumAmount", () => {
  // "Needs at least 1.0006" for a minimum of 1.00064 was refused again when
  // the user entered 1.0006.
  it("keeps every decimal to the zatoshi at any size", () => {
    expect(formatMinimumAmount("1.00064")).toBe("1.00064");
    expect(formatMinimumAmount(0.01068069)).toBe("0.01068069");
  });

  it("rounds up past the eighth decimal", () => {
    expect(formatMinimumAmount("0.012345671")).toBe("0.01234568");
    expect(formatMinimumAmount("0.012345674")).toBe("0.01234568");
  });

  it("reads nothing as 0", () => {
    expect(formatMinimumAmount(undefined)).toBe("0");
    expect(formatMinimumAmount("x")).toBe("0");
  });
});
