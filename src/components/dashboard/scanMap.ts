import { SyncStatusScanRangeType } from "../appstate";

/**
 * How wide each scan range is drawn, as a percentage of the map.
 *
 * Scaled to the span the ranges themselves cover. It used to be scaled to the
 * server's tip minus the wallet's birthday, which is the same span while there
 * is a connection and nothing at all without one: the tip reads 0 offline,
 * every width came out negative, and the map vanished — while its legend and
 * its "% synced", both read from the wallet, stayed on screen describing a map
 * that was not there.
 *
 * The wallet's own scanning is what the map is about, and the wallet knows it
 * with or without a server.
 */
export function scanRangeWidthsPercent(ranges: SyncStatusScanRangeType[]): number[] {
  if (ranges.length === 0) return [];
  const start: number = ranges.reduce((low, range) => Math.min(low, range.start_block), Infinity);
  const end: number = ranges.reduce((high, range) => Math.max(high, range.end_block), -Infinity);
  const span: number = end - start;
  // A single block, or ranges that somehow report none: share the width out
  // evenly rather than divide by zero.
  if (span <= 0) return ranges.map(() => 100 / ranges.length);
  return ranges.map((range) => ((range.end_block - range.start_block) * 100) / span);
}
