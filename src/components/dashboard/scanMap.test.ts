import { scanRangeWidthsPercent } from "./scanMap";
import { SyncStatusScanRangeType } from "../appstate";

const range = (start: number, end: number): SyncStatusScanRangeType =>
  ({ start_block: start, end_block: end }) as SyncStatusScanRangeType;

describe("scanRangeWidthsPercent", () => {
  it("shares the width by how much of the span each range covers", () => {
    expect(scanRangeWidthsPercent([range(100, 200), range(200, 300)])).toEqual([50, 50]);
    expect(scanRangeWidthsPercent([range(0, 25), range(25, 100)])).toEqual([25, 75]);
  });

  // The scale is the ranges' own span, so a wallet with no server tip — no
  // connection — still draws its map.
  it("does not depend on anything a server has to tell us", () => {
    const widths = scanRangeWidthsPercent([range(2_000_000, 2_400_000), range(2_400_000, 2_500_000)]);

    expect(widths).toEqual([80, 20]);
    expect(widths.every((w) => w > 0)).toBe(true);
  });

  it("has nothing to draw for no ranges", () => {
    expect(scanRangeWidthsPercent([])).toEqual([]);
  });

  it("shares it out evenly rather than dividing by zero", () => {
    expect(scanRangeWidthsPercent([range(500, 500), range(500, 500)])).toEqual([50, 50]);
  });
});
