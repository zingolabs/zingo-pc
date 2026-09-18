import { unswappableAddressChain } from "./unswappableAddressChain";

// Shapes only: the checksums are not what is being told apart here.
const MONERO = "4" + "8".repeat(94);
const THOR = "thor1" + "q".repeat(38);
const MAYA = "maya1" + "q".repeat(38);

describe("unswappableAddressChain", () => {
  it("names a Monero address, bare or in its URI", () => {
    expect(unswappableAddressChain(MONERO)).toBe("Monero");
    expect(unswappableAddressChain(`monero:${MONERO}?tx_amount=1`)).toBe("Monero");
  });

  it("names THORChain and Maya addresses", () => {
    expect(unswappableAddressChain(THOR)).toBe("THORChain (RUNE)");
    expect(unswappableAddressChain(MAYA)).toBe("Maya (CACAO)");
    expect(unswappableAddressChain(`thorchain:${THOR}`)).toBe("THORChain (RUNE)");
  });

  it("names nothing for other addresses", () => {
    expect(unswappableAddressChain("bc1qexample")).toBeUndefined();
    expect(unswappableAddressChain("0x1111111111111111111111111111111111111111")).toBeUndefined();
    expect(unswappableAddressChain("hello")).toBeUndefined();
  });
});
