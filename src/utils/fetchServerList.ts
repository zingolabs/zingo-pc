// Live lightwalletd registry, published by the community server monitor
// (zec.rocks "hosh"). It is the source of truth for the `auto` and `list`
// server modes; serverUrisList is the static fallback.
//
// The network call is made by the main process via the "servers:fetchList" IPC
// handler, which also owns the cache and the timeout. The renderer cannot do it
// directly, for the same three reasons as zns.ts:
//   - the production CSP forbids `connect-src` to external hosts
//   - cross-origin fetch from `file://` is blocked by CORS
//   - MAS / Flatpak sandboxes grant network at the app level (main process)
//
// Filtering and ranking live here rather than in main, which keeps the main
// half to transport and cache and this half a mirror of zingo-mobile's
// app/uris/fetchServerList.ts.

import { ServerChainNameEnum, ServerClass } from "../components/appstate";
import { ipcRenderer } from "../electronBridge";

// One entry of the hosh registry. Every field is optional: the payload is
// third-party, so nothing is assumed present.
type HoshServer = {
  hostname?: string;
  port?: number;
  online?: boolean;
  ping?: number;
  uptime_30d?: number;
};

type FetchServerListResult = { ok: true; servers: HoshServer[] } | { ok: false };

// Drops the genuinely flaky and nothing else. `uptime_30d` is a fraction, so
// this is 95%, and against the published spread (min 0.62, median 0.996) it cuts
// the outliers without thinning the list.
const MIN_UPTIME = 0.95;

/**
 * The live server list for a chain, already filtered and ranked.
 *
 * - Tor (`.onion`) hosts are dropped — this wallet does not route over Tor.
 * - Only servers reported `online` are kept.
 * - Servers below a 30-day uptime floor are dropped.
 * - Ranked best-first by ping, ties broken by uptime.
 *
 * Regtest (local, no public registry), an unreachable registry or a malformed
 * payload all give `[]` so the caller can fall back to the static list. Never
 * throws.
 */
const fetchServerList = async (chainName: ServerChainNameEnum): Promise<ServerClass[]> => {
  if (chainName === ServerChainNameEnum.regtestChainName) {
    return [];
  }

  let result: FetchServerListResult;
  try {
    result = await ipcRenderer.invoke("servers:fetchList", chainName);
  } catch {
    return [];
  }
  if (!result || !result.ok || !Array.isArray(result.servers)) {
    return [];
  }

  const clearnetOnline: HoshServer[] = result.servers.filter((s: HoshServer) => {
    const host = String(s?.hostname ?? "");
    if (host.length === 0 || host.endsWith(".onion") || s?.online !== true) {
      return false;
    }
    // Uptime is a floor, not a ranking. It is a fraction (0..1), and across the
    // published servers it barely separates them — the median sits at 0.996 and
    // the top at 0.998 — so ranking by it is close to ranking at random while
    // still letting a seven-second server sit second. Absent uptime is not held
    // against a server.
    return typeof s.uptime_30d !== "number" || s.uptime_30d >= MIN_UPTIME;
  });

  // Ranked by ping, which is what separates these servers and what the picker
  // shows next to each one. It is the registry's measurement from its own
  // vantage point, not the user's, so it orders the list and narrows the field —
  // the wallet still races the best few from here before committing.
  clearnetOnline.sort((a: HoshServer, b: HoshServer) => {
    const pa = typeof a.ping === "number" ? a.ping : Number.POSITIVE_INFINITY;
    const pb = typeof b.ping === "number" ? b.ping : Number.POSITIVE_INFINITY;
    if (pa !== pb) {
      return pa - pb;
    }
    const ua = typeof a.uptime_30d === "number" ? a.uptime_30d : 0;
    const ub = typeof b.uptime_30d === "number" ? b.uptime_30d : 0;
    return ub - ua;
  });

  // Every entry the registry lists is by definition current, so `obsolete` is
  // false across the board.
  return clearnetOnline.map((s: HoshServer) => ({
    uri: `https://${String(s.hostname)}:${Number(s.port) || 443}`,
    chain_name: chainName,
    latency: typeof s.ping === "number" ? Math.round(s.ping) : null,
    default: false,
    obsolete: false,
  }));
};

export default fetchServerList;
