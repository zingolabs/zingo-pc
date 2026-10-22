/**
 * What to tell the user when zingolib raised the wallet's birthday to Sapling
 * activation, or null when it did not.
 *
 * A birthday below activation never synced: no shielded note exists before it.
 * zingolib now raises it on restore and on reading the wallet file, and the
 * open or restore answer carries the old height as `birthday_adjusted_from`.
 * The raised height is saved, so this is said once.
 */
export function birthdayAdjustedNotice(answer: { birthday?: number; birthday_adjusted_from?: number }): string | null {
  const from = answer.birthday_adjusted_from;
  const to = answer.birthday;
  if (typeof from !== "number" || typeof to !== "number") return null;
  return (
    `This wallet's birthday was ${from}, before Sapling activated at ${to}. No shielded funds exist before then, ` +
    `so the wallet now starts from ${to} and syncs normally. Transparent funds received before ${to} and still ` +
    `unspent may not show.`
  );
}
