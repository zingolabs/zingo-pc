import dateformat from "dateformat";
import type { SwapRecordType } from "./types/SwapRecordType";

/** The pair a swap traded, sold first: "ZEC → ETH". */
export function swapPair(record: SwapRecordType): string {
  return `${record.sellAsset.ticker ?? record.sellAsset.symbol} → ${record.receiveAsset.ticker ?? record.receiveAsset.symbol}`;
}

/**
 * When a swap was made, short: "Nov 7, 9:05 AM". Through dateformat because
 * SES lockdown tames toLocaleString down to the full Date string.
 */
export function swapWhen(record: SwapRecordType): string {
  return dateformat(record.createdAtMs, "mmm d, h:MM TT");
}

/** The tag a swap's new address gets: "ZEC → ETH · Nov 7, 9:05 AM". */
export function swapAddressTag(record: SwapRecordType): string {
  return `${swapPair(record)} · ${swapWhen(record)}`;
}
