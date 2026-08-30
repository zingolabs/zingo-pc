import { isRealLegHash } from "./providers/trackUpdateBase";
import type { SwapRecordType } from "./types/SwapRecordType";

/** One transaction the detail view offers, under the name that swap gives it. */
export type HashRowType = {
  label: string;
  value: string;
};

/**
 * Every transaction a swap record can point at, once each.
 *
 * Filtered through `isRealLegHash` because a record written by an older build
 * can still hold an all-zero placeholder until the next poller tick rewrites
 * it, and a placeholder renders a row that copies nothing and links nowhere.
 *
 * De-duplicated because a swap has fewer transactions than it has names for
 * them. On an outbound swap the transaction this wallet broadcast is the one
 * the provider observes, so `broadcast.txId` and `observedDepositTxHash` hold
 * the same hash — and it was listed twice, under "Deposit" and under
 * "Broadcast", with a copy button each, as though there were two things to
 * look at. React noticed before anyone did: keyed on the hash, the two rows
 * collided.
 *
 * The first name wins, and the order below is what that means: what a hash is
 * to the swap before what this wallet did to produce it.
 */
export function hashRowsForRecord(record: SwapRecordType): HashRowType[] {
  const rows: HashRowType[] = [];

  if (isRealLegHash(record.observedDepositTxHash)) {
    rows.push({ label: "Deposit", value: record.observedDepositTxHash as string });
  }

  const hops = record.broadcast?.allTxIds;
  if (hops && hops.length > 0) {
    hops.forEach((hop, index) => {
      if (!isRealLegHash(hop)) return;
      // The last hop is the one that pays the vault; the ones before it are
      // the ZIP 320 indirection getting the funds to an address that can.
      const isLast = index === hops.length - 1;
      rows.push({ label: isLast ? "Broadcast" : `Broadcast hop ${index + 1}`, value: hop });
    });
  } else if (isRealLegHash(record.broadcast?.txId)) {
    rows.push({ label: "Broadcast", value: record.broadcast?.txId as string });
  }

  if (isRealLegHash(record.destinationTxHash)) {
    rows.push({ label: "Destination", value: record.destinationTxHash as string });
  }

  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.value)) return false;
    seen.add(row.value);
    return true;
  });
}
