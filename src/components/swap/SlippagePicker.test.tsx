import { formatSlippagePercent } from "./SlippagePicker";

describe("formatSlippagePercent", () => {
  it("Tests that a whole percent shows no decimals", () => {
    expect(formatSlippagePercent(100)).toBe("1");
    expect(formatSlippagePercent(300)).toBe("3");
  });

  it("Tests that a tenth of a percent shows one decimal", () => {
    expect(formatSlippagePercent(50)).toBe("0.5");
  });

  it("Tests that a basis point shows when the tolerance is below a tenth of a percent", () => {
    expect(formatSlippagePercent(1)).toBe("0.01");
    expect(formatSlippagePercent(25)).toBe("0.25");
  });
});
