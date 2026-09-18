import { isValidChainAddress } from "./addressValidators";
// Keyed by SwapKit's chain codes, so a contact's chain meets the catalog's.
describe("isValidChainAddress — SwapKit's chain codes", () => {
  const EVM = "0x1111111111111111111111111111111111111111";

  it("validates Tron under TRON and Gnosis under GNO", () => {
    expect(isValidChainAddress("TRON", "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb")).toBe(true);
    expect(isValidChainAddress("TRON", "not-a-tron-address")).toBe(false);
    expect(isValidChainAddress("GNO", EVM)).toBe(true);
  });

  it("validates the EVM chains that route ZEC and had no validator", () => {
    for (const chain of ["MONAD", "HYPEREVM", "ARC", "HOOD", "ADI", "HYPE"]) {
      expect(isValidChainAddress(chain, EVM)).toBe(true);
      expect(isValidChainAddress(chain, "bc1qexample")).toBe(false);
    }
  });

  it("validates Starknet and Aleo, which have their own formats", () => {
    expect(isValidChainAddress("STRK", "0x" + "a".repeat(64))).toBe(true);
    expect(isValidChainAddress("STRK", EVM)).toBe(false);
    expect(isValidChainAddress("ALEO", "aleo1" + "q".repeat(58))).toBe(true);
    expect(isValidChainAddress("ALEO", "aleo1short")).toBe(false);
  });

  // Recognised only to be named when refused.
  it("recognises THORChain, Maya and Monero addresses", () => {
    expect(isValidChainAddress("THOR", "thor1" + "q".repeat(38))).toBe(true);
    expect(isValidChainAddress("MAYA", "maya1" + "q".repeat(38))).toBe(true);
    expect(isValidChainAddress("XMR", "4" + "8".repeat(94))).toBe(true);
    expect(isValidChainAddress("XMR", "4short")).toBe(false);
  });
});
