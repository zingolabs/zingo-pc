import { useMemo } from "react";
import { useSwapRecords } from "../../context/ContextSwapService";
import { swapAddressOf } from "../../swap";
import type { SwapRecordType } from "../../swap";

/**
 * The wallet's addresses a swap made, each with its swap. The record links
 * them, so an address leaves this list when its swap is removed.
 */
export function useSwapAddresses(): ReadonlyMap<string, SwapRecordType> {
  const records = useSwapRecords();
  return useMemo(
    () =>
      new Map(
        records.flatMap((record) => {
          const address = swapAddressOf(record);
          return address ? [[address, record] as const] : [];
        }),
      ),
    [records],
  );
}
