import { useContext, useEffect, useRef } from "react";
import { ContextApp } from "../../context/ContextAppState";
import { SwapStore, newlyExpired, newlyRefunding } from "../../swap";
import type { SwapRecordType, SwapStatusEnum } from "../../swap";

/**
 * Says what happened to a purchase while the user was elsewhere: its deposit
 * ran out of time, or a payment came after that and is going back. Only a
 * change seen while the app runs: a swap already expired at launch says
 * nothing.
 */
export default function SwapExpiryNotice() {
  const { openErrorModal } = useContext(ContextApp);
  const seen = useRef<Map<string, SwapStatusEnum> | null>(null);

  useEffect(() => {
    const statuses = (records: ReadonlyArray<SwapRecordType>) =>
      new Map(records.map((record) => [record.recordId, record.status]));
    const coin = (record: SwapRecordType) => record.sellAsset.ticker ?? record.sellAsset.symbol;
    const unsubscribe = SwapStore.subscribe((records) => {
      const before = seen.current;
      seen.current = statuses(records);
      if (!before) return;
      newlyExpired(before, records).forEach((record) =>
        openErrorModal("Deposit not detected", `No ${coin(record)} deposit was detected. Nothing was sent.`),
      );
      newlyRefunding(before, records).forEach((record) =>
        openErrorModal(
          "Refunding",
          `Your ${coin(record)} arrived after this swap closed. It is going back to your refund address.`,
        ),
      );
    });
    SwapStore.readAll()
      .then((records) => {
        if (!seen.current) seen.current = statuses(records);
      })
      .catch((error) => console.log(`SwapExpiryNotice: initial read failed ${error}`));
    return unsubscribe;
  }, [openErrorModal]);

  return null;
}
