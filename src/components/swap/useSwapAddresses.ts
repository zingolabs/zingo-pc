import { useEffect, useMemo, useState } from "react";
import { useSwapRecords } from "../../context/ContextSwapService";
import { SwapStore, swapAddressOf } from "../../swap";
import type { SwapRecordType } from "../../swap";

/**
 * The wallet's addresses a swap made, each with its swap. A swap the user
 * removed stays as its marker (`removedAtMs` set, no swap ID), so its address
 * is still a swap's and never turns into one of the user's own.
 */
export function useSwapAddresses(): ReadonlyMap<string, SwapRecordType> {
  const records = useSwapRecords();
  const [removed, setRemoved] = useState<SwapRecordType[]>([]);

  // A removal notifies with the live records, so they changing is when to look again.
  useEffect(() => {
    let current = true;
    SwapStore.readRemoved()
      .then((markers) => current && setRemoved(markers))
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [records]);

  return useMemo(
    () =>
      new Map(
        [...removed, ...records].flatMap((record) => {
          const address = swapAddressOf(record);
          return address ? [[address, record] as const] : [];
        }),
      ),
    [records, removed],
  );
}
