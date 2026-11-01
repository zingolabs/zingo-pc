import { SyncStatusScanRangePriorityEnum, SyncStatusScanRangeType } from "../appstate";

/** What a scan range shows on the map. The same six states as zingo-mobile. */
export type ScanStateType = "scanned" | "pending" | "scanning" | "refetching" | "high" | "low";

/** The state of a range. Anything unrecognised is still to scan, so low. */
export function scanRangeState(priority: SyncStatusScanRangePriorityEnum): ScanStateType {
  switch (priority) {
    case SyncStatusScanRangePriorityEnum.Scanned:
      return "scanned";
    // Scanned, its nullifiers not mapped: only its spends are refetched later.
    case SyncStatusScanRangePriorityEnum.ScannedWithoutMapping:
      return "pending";
    case SyncStatusScanRangePriorityEnum.Scanning:
      return "scanning";
    // Refetching those nullifiers now.
    case SyncStatusScanRangePriorityEnum.RefetchingNullifiers:
      return "refetching";
    case SyncStatusScanRangePriorityEnum.Verify:
    case SyncStatusScanRangePriorityEnum.ChainTip:
    case SyncStatusScanRangePriorityEnum.FoundNote:
    case SyncStatusScanRangePriorityEnum.OpenAdjacent:
      return "high";
    default:
      return "low";
  }
}

export const SCAN_STATE_COLOR: Record<ScanStateType, string> = {
  scanned: "#149D05",
  pending: "#5DBB4C",
  scanning: "#F99D00",
  refetching: "#EBFF5A",
  high: "#8FB4E6",
  low: "#4A6487",
};

export const SCAN_LEGEND: { state: ScanStateType; label: string }[] = [
  { state: "scanned", label: "Scanned" },
  { state: "pending", label: "Scanned (spends pending)" },
  { state: "scanning", label: "Scanning" },
  { state: "refetching", label: "Refetching spends" },
  { state: "high", label: "High priority" },
  { state: "low", label: "Low priority" },
];

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
