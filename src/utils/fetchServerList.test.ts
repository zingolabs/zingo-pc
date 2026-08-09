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
  uptime_30d: 100,
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

test("ranks by uptime, then by ping", async () => {
  respondWith([
    server("slow.example.com", { uptime_30d: 99, ping: 300 }),
    server("best.example.com", { uptime_30d: 100, ping: 200 }),
    server("fast.example.com", { uptime_30d: 99, ping: 40 }),
  ]);

  const list = await fetchServerList(ServerChainNameEnum.mainChainName);

  expect(list.map((s) => s.uri)).toEqual([
    "https://best.example.com:443",
    "https://fast.example.com:443",
    "https://slow.example.com:443",
  ]);
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
