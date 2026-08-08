// Live lightwalletd registry, published by the community server monitor
// (zec.rocks "hosh"). It backs the `auto` and `list` server modes; the static
// serverUrisList in the renderer is the fallback.
//
// This runs over clearnet, unlike the price. Boot ordering leaves no choice:
// the wallet cannot open without a server, and in `auto` there is no server
// until this list lands, so waiting for mixnet convergence would deadlock the
// launch. The cache is what keeps the exposure down — inside the TTL a launch
// makes no request at all.
//
// It lives in the main process for the same three reasons as the ZNS resolver:
// the renderer's CSP forbids `connect-src` to external hosts, CORS blocks a
// file:// origin, and sandboxed builds grant network at the app level.
//
// Everything it touches arrives by injection so the whole thing can be driven
// from a test without Electron.

const HOSH_URL = "https://hosh.zec.rocks/api/v0/zec.json";
const SERVER_LIST_TIMEOUT_MS = 2000;
const SERVER_LIST_TTL_MS = 6 * 60 * 60 * 1000;
const SERVER_LIST_CHAINS = new Set(["main", "test"]);

// Kept outside the `all` namespace so it never rides along in loadSettings.
const cacheKey = (chain) => `serverlist.${chain}`;

/**
 * @param store  persistence, `{ get(key), set(key, value) }` — electron-settings in the app
 * @param fetchImpl  defaults to the global fetch
 * @param now  defaults to Date.now
 */
function createServerRegistry({ store, fetchImpl = fetch, now = Date.now }) {
  // One in-flight request per chain, so the startup warm-up and the renderer's
  // ask share a single round-trip instead of racing each other.
  const inFlight = new Map();

  const readCache = (chain) => {
    const entry = store.get(cacheKey(chain));
    if (!entry || typeof entry.at !== "number" || !Array.isArray(entry.servers)) return null;
    return entry;
  };

  const request = async (chain) => {
    const resp = await fetchImpl(`${HOSH_URL}?chain=${chain}`, {
      signal: AbortSignal.timeout(SERVER_LIST_TIMEOUT_MS),
    });
    if (!resp.ok) throw new Error(`hosh responded ${resp.status}`);
    const json = await resp.json();
    if (!Array.isArray(json?.servers)) throw new Error("hosh payload has no servers array");
    store.set(cacheKey(chain), { at: now(), servers: json.servers });
    return json.servers;
  };

  // Resolves to the raw server array, or null when there is nothing to serve.
  // Never rejects: a launch must not hang or die on this. A failed request
  // falls back to a stale cache, which still beats the static list.
  const load = (chain) => {
    if (!SERVER_LIST_CHAINS.has(chain)) return Promise.resolve(null);

    const cached = readCache(chain);
    if (cached && now() - cached.at < SERVER_LIST_TTL_MS) {
      return Promise.resolve(cached.servers);
    }
    const pending = inFlight.get(chain);
    if (pending) return pending;

    const started = request(chain)
      .catch(() => (cached ? cached.servers : null))
      .finally(() => inFlight.delete(chain));
    inFlight.set(chain, started);
    return started;
  };

  return { load };
}

module.exports = {
  createServerRegistry,
  HOSH_URL,
  SERVER_LIST_TIMEOUT_MS,
  SERVER_LIST_TTL_MS,
};
