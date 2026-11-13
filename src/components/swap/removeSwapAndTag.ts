import { SwapStore, swapAddressOf } from "../../swap";
import type { SwapRecordType } from "../../swap";

/** Deletes a swap and drops the address book entry of the address it made. */
export async function removeSwapAndTag(
  record: SwapRecordType,
  removeAddresses: (addresses: string[]) => void,
): Promise<void> {
  await SwapStore.deleteByRecordId(record.recordId);
  const made = swapAddressOf(record);
  if (made) removeAddresses([made]);
}
