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

// The suffix is ours, not the protocol's: a registration is the bare name
// and the rules forbid a dot inside it, so the registry never sees
// ".zcash" or ".zec" and cannot tell them apart. What the suffix decides
// here is whether the user means a name at all, rather than a mistyped
// address.
//
// Which is why this list stays closed. Accepting any suffix would turn a
// fumbled address, a domain or half an email into a silent lookup of
// whoever owns its first label, and hand back a real address to send to.
// These two earn their place by being in circulation — .zcash from
// zcashnames itself, .zec from Edge, which hands out names in that form —
// so someone typing one is asking for a name. Nothing else is.
const ZNS_ALIAS_RE = /^([a-z0-9]{1,62})\.(?:zcash|zec)$/i;

const CACHE_TTL_MS = 5 * 60 * 1000;
type CacheEntry = { address: string | null; expiresAt: number };
const cache: Map<string, CacheEntry> = new Map();

export type ZnsResolveResult =
  | { ok: true; address: string }
  | { ok: false; reason: "not-found" | "network" | "unsupported-chain" | "invalid-name" };

/** True if `s` looks like a ZNS alias (e.g. "alice.zcash" or "alice.zec"). */
export function isZnsAlias(s: string): boolean {
  return ZNS_ALIAS_RE.test(s.trim());
}

/** Strips the suffix; returns null if `s` is not a valid alias. */
export function extractZnsName(s: string): string | null {
  const m = s.trim().toLowerCase().match(ZNS_ALIAS_RE);
  return m ? m[1] : null;
}

/**
 * True when two strings name the same ZNS registration.
 *
 * The registry stores a bare label, so "pepe.zcash" and "pepe.zec" are one
 * name written two ways — and so are "Pepe.zcash" and "pepe.zcash". Comparing
 * the text as typed would file them as separate contacts that resolve to the
 * same address.
 */
export function isSameZnsAlias(a: string, b: string): boolean {
  const name = extractZnsName(a);
  return name !== null && name === extractZnsName(b);
}

/** Resolve a name (or a full alias like "alice.zcash") to a UA via the main-process IPC. */
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
