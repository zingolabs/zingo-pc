import type { FlashnetExplorerClient } from "./FlashnetExplorerClient";
import { SwapDirectionEnum } from "./enums/SwapDirectionEnum";
import { SwapKitProviderEnum } from "./enums/SwapKitProviderEnum";
import { isRealLegHash } from "./providers/trackUpdateBase";
import type { SwapRecordType } from "./types/SwapRecordType";

/**
 * Whether a record is an inbound Flashnet swap that Flashnet has taken an
 * order for but whose deposit transaction the wallet still does not know.
 *
 * Inbound only: an outbound deposit is this wallet's own broadcast, so its
 * hash is always known. The order id is what arrives once Flashnet has seen
 * the deposit, which is also what makes the question answerable.
 */
export function lacksFlashnetDepositHash(record: SwapRecordType): boolean {
  return (
    record.provider === SwapKitProviderEnum.Flashnet &&
    record.direction === SwapDirectionEnum.Inbound &&
    !!record.providerOrderId &&
    !isRealLegHash(record.observedDepositTxHash)
  );
}

/**
 * A record fresh from a `/track` update, with its deposit hash filled from
 * Flashnet's explorer when `/track` left it empty.
 *
 * The update stamps the current capture version, which tells the detail view
 * the record needs nothing more. A record that is still missing the hash does
 * need more, so it keeps the version it had before the update: a finished swap
 * is then asked about again when it is next shown, rather than left without
 * its deposit for good because the explorer was unreachable once.
 *
 * Never throws. A failed request is logged and the record is returned as it
 * would have been without the explorer.
 */
export async function fillFlashnetDepositHash(
  updated: SwapRecordType,
  args: {
    previousVersion: number | undefined;
    client: Pick<FlashnetExplorerClient, "getOrderSourceTxHash"> | undefined;
  },
): Promise<SwapRecordType> {
  if (!lacksFlashnetDepositHash(updated)) return updated;

  let hash: string | null = null;
  if (args.client) {
    try {
      hash = await args.client.getOrderSourceTxHash(updated.providerOrderId as string);
    } catch (err) {
      console.log(`fillFlashnetDepositHash: explorer lookup failed for ${updated.recordId}:`, err);
    }
  }

  return hash ? { ...updated, observedDepositTxHash: hash } : { ...updated, trackCaptureVersion: args.previousVersion };
}
