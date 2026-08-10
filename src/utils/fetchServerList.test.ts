import { ipcRenderer } from "../electronBridge";
import { ServerChainNameEnum } from "../components/appstate";
import fetchServerList from "./fetchServerList";

jest.mock("../electronBridge");

const invoke = ipcRenderer.invoke as jest.Mock;

const server = (hostname: string, extra: Record<string, unknown> = {}) => ({
  hostname,
  port: 443,
  online: true,
  ping: 100,
  // A fraction, not a percentage — the registry publishes 0..1.
  uptime_30d: 0.99,
  ...extra,
});

const respondWith = (servers: unknown[]) => invoke.mockResolvedValue({ ok: true, servers });

beforeEach(() => {
  invoke.mockReset();
});

test("drops Tor hosts and offline servers", async () => {
  respondWith([
    server("na.zec.rocks"),
    server("abcdef.onion"),
    server("down.example.com", { online: false }),
    server(""),
  ]);

  const list = await fetchServerList(ServerChainNameEnum.mainChainName);

  expect(list.map((s) => s.uri)).toEqual(["https://na.zec.rocks:443"]);
});

test("ranks by ping, then by uptime", async () => {
  respondWith([
    server("slow.example.com", { ping: 300, uptime_30d: 0.999 }),
    server("quick.example.com", { ping: 40, uptime_30d: 0.96 }),
    server("mid.example.com", { ping: 120, uptime_30d: 0.98 }),
  ]);

  const list = await fetchServerList(ServerChainNameEnum.mainChainName);

  expect(list.map((s) => s.uri)).toEqual([
    "https://quick.example.com:443",
    "https://mid.example.com:443",
    "https://slow.example.com:443",
  ]);
});

// The registry publishes servers with near-identical uptime and wildly
// different ping, so uptime is a floor and ping is the ranking. A reliable
// seven-second server used to sit second on this list.
test("drops the genuinely flaky, keeps the merely ordinary", async () => {
  respondWith([
    server("flaky.example.com", { uptime_30d: 0.62, ping: 10 }),
    server("ordinary.example.com", { uptime_30d: 0.96, ping: 200 }),
  ]);

  const list = await fetchServerList(ServerChainNameEnum.mainChainName);

  expect(list.map((s) => s.uri)).toEqual(["https://ordinary.example.com:443"]);
});

test("does not hold a missing uptime against a server", async () => {
  respondWith([{ hostname: "nouptime.example.com", port: 443, online: true, ping: 50 }]);

  const list = await fetchServerList(ServerChainNameEnum.mainChainName);

  expect(list.map((s) => s.uri)).toEqual(["https://nouptime.example.com:443"]);
});
test("maps a registry entry onto a ServerClass", async () => {
  respondWith([server("eu.zec.rocks", { port: 9067, ping: 42.7 })]);

  const [entry] = await fetchServerList(ServerChainNameEnum.testChainName);

  expect(entry).toEqual({
    uri: "https://eu.zec.rocks:9067",
    chain_name: ServerChainNameEnum.testChainName,
    latency: 43,
    default: false,
    obsolete: false,
  });
});

test("falls back to port 443 and a null latency when the entry omits them", async () => {
  respondWith([{ hostname: "bare.example.com", online: true }]);

  const [entry] = await fetchServerList(ServerChainNameEnum.mainChainName);

  expect(entry.uri).toBe("https://bare.example.com:443");
  expect(entry.latency).toBeNull();
});

test("never asks the registry about regtest", async () => {
  expect(await fetchServerList(ServerChainNameEnum.regtestChainName)).toEqual([]);
  expect(invoke).not.toHaveBeenCalled();
});

// Each of these has to leave the caller on the static list rather than with a
// half-built one, so they all resolve empty instead of throwing.
test("gives an empty list when the registry is unreachable", async () => {
  invoke.mockResolvedValue({ ok: false });

  expect(await fetchServerList(ServerChainNameEnum.mainChainName)).toEqual([]);
});

test("gives an empty list when the IPC call itself fails", async () => {
  invoke.mockRejectedValue(new Error("channel not allowed"));

  expect(await fetchServerList(ServerChainNameEnum.mainChainName)).toEqual([]);
});

test("gives an empty list when the payload is malformed", async () => {
  invoke.mockResolvedValue({ ok: true, servers: "not an array" });

  expect(await fetchServerList(ServerChainNameEnum.mainChainName)).toEqual([]);
});
