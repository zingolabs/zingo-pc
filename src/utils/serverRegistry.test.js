// The main-process half of the live registry. It never runs in the renderer, so
// this reaches into public/ directly and drives it with an injected store,
// fetch and clock.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createServerRegistry, SERVER_LIST_TTL_MS } = require("../../public/serverRegistry");

const servers = [{ hostname: "na.zec.rocks", port: 443, online: true }];

const okResponse = (payload) => ({ ok: true, json: async () => payload });

const makeStore = (seed = {}) => {
  const data = { ...seed };
  return {
    get: (key) => data[key],
    set: (key, value) => {
      data[key] = value;
    },
    data,
  };
};

test("fetches, returns and caches the registry's servers", async () => {
  const store = makeStore();
  const fetchImpl = jest.fn().mockResolvedValue(okResponse({ servers }));
  const registry = createServerRegistry({ store, fetchImpl, now: () => 1000 });

  expect(await registry.load("main")).toEqual(servers);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(store.data["serverlist.main"]).toEqual({ at: 1000, servers });
});

test("serves a cache inside its TTL without going out", async () => {
  const store = makeStore({ "serverlist.main": { at: 1000, servers } });
  const fetchImpl = jest.fn();
  const registry = createServerRegistry({ store, fetchImpl, now: () => 1000 + SERVER_LIST_TTL_MS - 1 });

  expect(await registry.load("main")).toEqual(servers);
  expect(fetchImpl).not.toHaveBeenCalled();
});

test("refetches once the cache is past its TTL", async () => {
  const fresh = [{ hostname: "eu.zec.rocks", port: 443, online: true }];
  const store = makeStore({ "serverlist.main": { at: 1000, servers } });
  const fetchImpl = jest.fn().mockResolvedValue(okResponse({ servers: fresh }));
  const registry = createServerRegistry({ store, fetchImpl, now: () => 1000 + SERVER_LIST_TTL_MS });

  expect(await registry.load("main")).toEqual(fresh);
});

// Stale data still beats the static list, so a failed request keeps whatever the
// last good one left behind.
test("falls back to a stale cache when the request fails", async () => {
  const store = makeStore({ "serverlist.main": { at: 0, servers } });
  const fetchImpl = jest.fn().mockRejectedValue(new Error("offline"));
  const registry = createServerRegistry({ store, fetchImpl, now: () => SERVER_LIST_TTL_MS * 2 });

  expect(await registry.load("main")).toEqual(servers);
});

test("resolves null when the request fails and there is no cache", async () => {
  const registry = createServerRegistry({
    store: makeStore(),
    fetchImpl: jest.fn().mockRejectedValue(new Error("offline")),
  });

  expect(await registry.load("main")).toBeNull();
});

test("treats a non-2xx response as a failure", async () => {
  const registry = createServerRegistry({
    store: makeStore(),
    fetchImpl: jest.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }),
  });

  expect(await registry.load("main")).toBeNull();
});

test("treats a payload without a servers array as a failure", async () => {
  const store = makeStore();
  const registry = createServerRegistry({
    store,
    fetchImpl: jest.fn().mockResolvedValue(okResponse({ nope: true })),
  });

  expect(await registry.load("main")).toBeNull();
  expect(store.data["serverlist.main"]).toBeUndefined();
});

// The startup warm-up and the renderer's ask land on the same promise, rather
// than opening two connections for the same answer.
test("shares one in-flight request between concurrent callers", async () => {
  const fetchImpl = jest.fn().mockResolvedValue(okResponse({ servers }));
  const registry = createServerRegistry({ store: makeStore(), fetchImpl });

  const [first, second] = await Promise.all([registry.load("main"), registry.load("main")]);

  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(first).toEqual(servers);
  expect(second).toEqual(servers);
});

test("asks the registry nothing about a chain it does not publish", async () => {
  const fetchImpl = jest.fn();
  const registry = createServerRegistry({ store: makeStore(), fetchImpl });

  expect(await registry.load("regtest")).toBeNull();
  expect(fetchImpl).not.toHaveBeenCalled();
});

test("asks per chain, with a cache key per chain", async () => {
  const store = makeStore();
  const fetchImpl = jest.fn().mockResolvedValue(okResponse({ servers }));
  const registry = createServerRegistry({ store, fetchImpl, now: () => 1000 });

  await registry.load("main");
  await registry.load("test");

  expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
    expect.stringContaining("chain=main"),
    expect.stringContaining("chain=test"),
  ]);
  expect(Object.keys(store.data).sort()).toEqual(["serverlist.main", "serverlist.test"]);
});
