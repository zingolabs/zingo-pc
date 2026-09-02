import { userFacingError } from "./userFacingError";

describe("userFacingError", () => {
  // The real one, layer for layer, as it reached the send screen.
  it("keeps only the fact from a fully wrapped wallet refusal", () => {
    const error = new Error(
      "Error invoking remote method 'native:get_spendable_balance_with_address': " +
        "Error: Error: read: insufficient funds: 0 available of 10000 required",
    );
    expect(userFacingError(error)).toBe("read: insufficient funds: 0 available of 10000 required");
  });

  it("strips the wrappers in either order and however many deep", () => {
    expect(userFacingError(new Error("Error: Error: Error: something went wrong"))).toBe("something went wrong");
    expect(userFacingError(new Error("Error: Error invoking remote method 'native:send': Error: nope"))).toBe("nope");
  });

  // The wallet's label for what it was doing stays, all of them alike. Judging
  // them one at a time only yields a rule that fits whichever one prompted it.
  it("leaves the labels that say what was being attempted", () => {
    expect(userFacingError(new Error("Error: sync: chain reorg beyond the reorg buffer"))).toBe(
      "sync: chain reorg beyond the reorg buffer",
    );
    expect(userFacingError(new Error("Error: saving wallet: disk full"))).toBe("saving wallet: disk full");
    expect(userFacingError(new Error("Error: read: no such note"))).toBe("read: no such note");
  });

  it("passes a plain message through untouched", () => {
    expect(userFacingError(new Error("insufficient funds"))).toBe("insufficient funds");
  });

  // Not everything thrown is an Error.
  it("takes a thrown string or object", () => {
    expect(userFacingError("Error: read: nope")).toBe("read: nope");
    expect(userFacingError({ toString: () => "Error: plain object" })).toBe("plain object");
  });

  // An empty line reads as no error at all, which is worse than saying there
  // was one without detail.
  it("says something when the wrappers were the whole message", () => {
    expect(userFacingError(new Error("Error: Error:"))).toBe("The wallet reported an error with no detail.");
    expect(userFacingError(undefined)).toBe("The wallet reported an error with no detail.");
  });
});
