// Zcash Names Service (ZNS) — renderer-side client.
//
// The actual network call is made by the main process via the "zns:resolve"
// IPC handler (which uses the `zcashname-sdk` package). The renderer cannot
// do it directly because:
//   - the production CSP forbids `connect-src` to external hosts
//   - cross-origin fetch from `file://` is blocked by CORS
//   - MAS / Flatpak sandboxes grant network at the app level (main process)
//
// This module keeps the public API stable (callers don't know about IPC) and
// adds an in-memory cache so a debounced UI doesn't hammer the indexer.

import { ServerChainNameEnum } from "../components/appstate";
import { ipcRenderer } from "../electronBridge";

// Names must be [a-z0-9]{1,62} per the ZNS protocol.
const ZNS_NAME_RE = /^[a-z0-9]{1,62}$/;
const ZNS_ALIAS_RE = /^([a-z0-9]{1,62})\.zcash$/i;

const CACHE_TTL_MS = 5 * 60 * 1000;
type CacheEntry = { address: string | null; expiresAt: number };
const cache: Map<string, CacheEntry> = new Map();

export type ZnsResolveResult =
  | { ok: true; address: string }
  | { ok: false; reason: "not-found" | "network" | "unsupported-chain" | "invalid-name" };

/** True if `s` looks like a ZNS alias (e.g. "alice.zcash"). */
export function isZnsAlias(s: string): boolean {
  return ZNS_ALIAS_RE.test(s.trim());
}

/** Strips the ".zcash" suffix; returns null if `s` is not a valid alias. */
export function extractZnsName(s: string): string | null {
  const m = s.trim().toLowerCase().match(ZNS_ALIAS_RE);
  return m ? m[1] : null;
}

/** Resolve a name (or full "alice.zcash" alias) to a UA via the main-process IPC. */
export async function resolveZnsAlias(aliasOrName: string, chain: ServerChainNameEnum | ""): Promise<ZnsResolveResult> {
  const bare = aliasOrName.includes(".") ? extractZnsName(aliasOrName) : aliasOrName.trim().toLowerCase();
  if (!bare || !ZNS_NAME_RE.test(bare)) return { ok: false, reason: "invalid-name" };

  const cacheKey = `${chain}:${bare}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.address ? { ok: true, address: cached.address } : { ok: false, reason: "not-found" };
  }

  const result: ZnsResolveResult = await ipcRenderer.invoke("zns:resolve", bare, chain);

  // Cache successful resolutions and not-found (negative caching), but NOT
  // network / unsupported-chain errors — those should retry next call.
  if (result?.ok) {
    cache.set(cacheKey, { address: result.address, expiresAt: Date.now() + CACHE_TTL_MS });
  } else if (result?.reason === "not-found") {
    cache.set(cacheKey, { address: null, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  return result;
}

/** Test-only: drop all cached entries. */
export function _clearZnsCacheForTests(): void {
  cache.clear();
}
