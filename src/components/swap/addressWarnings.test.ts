import { DESTINATION_ADDRESS_WARNING, REFUND_ADDRESS_WARNING } from "./addressWarnings";

describe("swap address warnings", () => {
  // The instruction is shared: no validation can tell a well-formed address on
  // the right chain from yours, so reading it is the only check left.
  it("both tell the user to read the address", () => {
    expect(DESTINATION_ADDRESS_WARNING).toMatch(/Check this address/);
    expect(REFUND_ADDRESS_WARNING).toMatch(/Check this address/);
  });

  // A destination takes every swap, so a wrong one is a loss that has already
  // happened. A refund address is used only when a swap has to be returned,
  // and saying otherwise would overstate one and understate the other.
  it("say different things about what a wrong one costs", () => {
    expect(DESTINATION_ADDRESS_WARNING).not.toEqual(REFUND_ADDRESS_WARNING);
    expect(DESTINATION_ADDRESS_WARNING).toMatch(/cannot be recovered/);
    expect(REFUND_ADDRESS_WARNING).toMatch(/returned/);
  });

  // The destination's loss is unconditional; the refund's is not. Neither
  // wording should borrow the other's certainty.
  it("keep the refund's cost conditional and the destination's not", () => {
    expect(REFUND_ADDRESS_WARNING).toMatch(/\bIf\b/);
    expect(DESTINATION_ADDRESS_WARNING).not.toMatch(/\bIf\b/);
  });

  // It holds for all four providers and every sum. A threshold read off a
  // support policy would suggest cover above it that nobody promises.
  it("name no amount and no provider", () => {
    for (const warning of [DESTINATION_ADDRESS_WARNING, REFUND_ADDRESS_WARNING]) {
      expect(warning).not.toMatch(/\$|\d/);
      expect(warning).not.toMatch(/NEAR|Thorchain|Maya|Flashnet|SwapKit/i);
    }
  });
});
