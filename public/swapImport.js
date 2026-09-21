/**
 * Bringing one installation's swap history into another's.
 *
 * Swap records are the one thing a migration used to leave behind. The wallet
 * files, the settings and the address book were copied; the swaps — the
 * history of them, and the tracking of any still in flight — stayed in the
 * installation the user had just moved off.
 *
 * They live one encrypted file per wallet, keyed by a fingerprint derived from
 * the wallet's UFVK, so the same wallet in the new installation looks for the
 * same file name. What is inside is a JSON array of records, each with a
 * `recordId` minted at commit time.
 *
 * Merging is by that id, keeping what this installation already holds: its
 * copy of a swap has been polled at least as recently as the one arriving, and
 * a user who imports twice should not end up with the same swap listed twice.
 *
 * `depositAddress` is the fallback key for records written before `recordId`
 * existed, which is the same key SwapStore migrates them on.
 */

/** Files in a `swap-storage` directory. One per wallet. */
const SWAP_FILE_SUFFIX = ".bin";

function recordKey(record) {
  if (!record || typeof record !== "object") return null;
  return record.recordId || record.depositAddress || null;
}

function mergeSwapRecords(destRecords, srcRecords) {
  const records = Array.isArray(destRecords) ? destRecords.slice() : [];
  const incoming = Array.isArray(srcRecords) ? srcRecords : [];

  const seen = new Set(records.map(recordKey).filter(Boolean));
  let added = 0;
  let skipped = 0;

  for (const record of incoming) {
    const key = recordKey(record);
    if (!key || seen.has(key)) {
      skipped += 1;
      continue;
    }
    records.push(record);
    seen.add(key);
    added += 1;
  }

  return { records, added, skipped };
}

module.exports = { SWAP_FILE_SUFFIX, mergeSwapRecords, recordKey };
