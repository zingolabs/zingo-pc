/**
 * @jest-environment node
 */

const { mergeSwapRecords, recordKey } = require("../../public/swapImport");

describe("mergeSwapRecords", () => {
  // What this installation holds has been polled at least as recently as what
  // is arriving, so it is the copy that stays.
  it("keeps this installation's copy of a swap it already has", () => {
    const dest = [{ recordId: "a", status: "completed" }];
    const src = [{ recordId: "a", status: "processing" }];

    const { records, added, skipped } = mergeSwapRecords(dest, src);

    expect(records).toEqual([{ recordId: "a", status: "completed" }]);
    expect(added).toBe(0);
    expect(skipped).toBe(1);
  });

  it("brings over the swaps it does not have", () => {
    const { records, added, skipped } = mergeSwapRecords([{ recordId: "a" }], [{ recordId: "a" }, { recordId: "b" }]);

    expect(records.map((r) => r.recordId)).toEqual(["a", "b"]);
    expect(added).toBe(1);
    expect(skipped).toBe(1);
  });

  it("imports into an installation with no swaps at all", () => {
    expect(mergeSwapRecords(null, [{ recordId: "a" }]).records).toHaveLength(1);
  });

  // Records written before `recordId` existed are keyed on the deposit address,
  // which is what SwapStore migrates them on.
  it("falls back to the deposit address for an older record", () => {
    const { added, skipped } = mergeSwapRecords([{ depositAddress: "t1abc" }], [{ depositAddress: "t1abc" }]);

    expect(added).toBe(0);
    expect(skipped).toBe(1);
  });

  it("drops anything with no key at all rather than duplicating it later", () => {
    const { records, skipped } = mergeSwapRecords([], [{ status: "completed" }]);

    expect(records).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it("reads a key from either field", () => {
    expect(recordKey({ recordId: "a", depositAddress: "t1" })).toBe("a");
    expect(recordKey({ depositAddress: "t1" })).toBe("t1");
    expect(recordKey(null)).toBeNull();
  });
});
