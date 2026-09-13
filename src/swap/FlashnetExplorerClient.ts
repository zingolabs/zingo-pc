import { swapHttpRequest } from "./swapHttp";
import { isRealLegHash } from "./providers/trackUpdateBase";

/**
 * The public API behind Flashnet's Orchestra explorer, read for one thing:
 * the source-chain transaction that paid an order.
 *
 * SwapKit's `/track`, queried by deposit address as a Flashnet swap has to
 * be, returns the source leg with an empty hash, even once the swap has
 * completed. For an inbound swap the user paid from another wallet, so that
 * leg is the only place the wallet could learn the deposit transaction, and
 * without it the swap has no deposit row, no source-chain link and no
 * SwapKit explorer link. Flashnet's own explorer shows the hash, and the
 * route it reads it from answers without a key.
 *
 * Undocumented: this is the explorer's API, not the authenticated partner API
 * Flashnet documents, so it is used as a fallback that may stop answering.
 * When it does, the swap is left as it would have been without it. The
 * privacy cost is recorded in docs/swap-privacy.md.
 */
const FLASHNET_EXPLORER_BASE_URL = "https://orchestration.flashnet.xyz";
const FLASHNET_EXPLORER_TIMEOUT_MS = 10_000;

/** How long to wait before asking again about an order that had no hash yet. */
export const FLASHNET_EXPLORER_RETRY_MS = 60_000;

/** Flashnet order ids as `/track` reports them, e.g. `ord_00000000-aaaa-…`. */
const ORDER_ID_PATTERN = /^ord_[0-9a-z-]+$/i;

export class FlashnetExplorerClient {
  // A found hash never changes, so it is kept. A miss is kept only long enough
  // that a poll every few seconds does not become a request every few seconds.
  private readonly found = new Map<string, string>();
  private readonly lastMissAtMs = new Map<string, number>();
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  /**
   * The source-chain transaction hash Flashnet recorded for an order, or null
   * while it has none, for an order it does not know, or for an id that is not
   * a Flashnet order id. Throws on a transport failure or an unexpected HTTP
   * status, for the caller to log.
   */
  async getOrderSourceTxHash(orderId: string): Promise<string | null> {
    if (!ORDER_ID_PATTERN.test(orderId)) return null;
    const cached = this.found.get(orderId);
    if (cached) return cached;
    const lastMiss = this.lastMissAtMs.get(orderId);
    if (lastMiss !== undefined && this.now() - lastMiss < FLASHNET_EXPLORER_RETRY_MS) return null;

    // Recorded before asking, so a request that fails waits out the same
    // interval as one that finds nothing.
    this.lastMissAtMs.set(orderId, this.now());

    // Through the main process, like every other swap request: the renderer's
    // CSP refuses the host. See `swapHttp`.
    const response = await swapHttpRequest({
      url: `${FLASHNET_EXPLORER_BASE_URL}/v1/explorer/operations/${encodeURIComponent(orderId)}`,
      method: "GET",
      headers: { Accept: "application/json" },
      timeoutMs: FLASHNET_EXPLORER_TIMEOUT_MS,
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`FlashnetExplorerClient: order ${orderId} returned HTTP ${response.status}`);
    }

    const data = JSON.parse(response.text) as { operation?: { sourceTxHash?: unknown } };
    const hash = data.operation?.sourceTxHash;
    if (typeof hash !== "string" || !isRealLegHash(hash)) return null;

    this.found.set(orderId, hash);
    this.lastMissAtMs.delete(orderId);
    return hash;
  }
}
