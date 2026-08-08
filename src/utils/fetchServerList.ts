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

/**
 * The live server list for a chain, already filtered and ranked.
 *
 * - Tor (`.onion`) hosts are dropped — this wallet does not route over Tor.
 * - Only servers reported `online` are kept.
 * - Ranked best-first: highest 30-day uptime, ties broken by lowest ping.
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
    return host.length > 0 && !host.endsWith(".onion") && s?.online === true;
  });

  clearnetOnline.sort((a: HoshServer, b: HoshServer) => {
    const ua = typeof a.uptime_30d === "number" ? a.uptime_30d : 0;
    const ub = typeof b.uptime_30d === "number" ? b.uptime_30d : 0;
    if (ub !== ua) {
      return ub - ua;
    }
    const pa = typeof a.ping === "number" ? a.ping : Number.POSITIVE_INFINITY;
    const pb = typeof b.ping === "number" ? b.ping : Number.POSITIVE_INFINITY;
    return pa - pb;
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
