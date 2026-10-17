import { ServerChainNameEnum, ServerClass } from "../components/appstate";
import fetchServerList from "./fetchServerList";
import selectFastestServer from "./selectFastestServer";
import pickAutoServer from "./pickAutoServer";

jest.mock("../electronBridge");
jest.mock("./fetchServerList");
jest.mock("./selectFastestServer", () => ({ __esModule: true, default: jest.fn(), RACE_CANDIDATES: 3 }));

const liveList = fetchServerList as jest.MockedFunction<typeof fetchServerList>;
const race = selectFastestServer as jest.MockedFunction<typeof selectFastestServer>;

const MAIN = ServerChainNameEnum.mainChainName;
const ZAINO = "https://mainnet.zainod.zingolabs.dev:443";

const server = (uri: string): ServerClass => ({
  uri,
  chain_name: MAIN,
  latency: null,
  default: false,
  obsolete: false,
});

/** A race only the given servers win, first listed first. */
const answering = (...uris: string[]) =>
  race.mockImplementation(async (servers: ServerClass[]) => servers.find((s) => uris.includes(s.uri)) ?? null);

beforeEach(() => {
  liveList.mockReset().mockResolvedValue([server("https://one.zec.rocks:443"), server("https://two.zec.rocks:443")]);
  race.mockReset().mockResolvedValue(null);
});

// zingo-mobile's order: recommended, registry, static, default.
test("takes the recommended server while it answers", async () => {
  answering(ZAINO, "https://one.zec.rocks:443");

  expect(await pickAutoServer(MAIN)).toEqual({ uri: ZAINO, tier: "recommended" });
});

test("races the registry's best few when the recommended server is silent", async () => {
  answering("https://two.zec.rocks:443");

  expect(await pickAutoServer(MAIN)).toEqual({ uri: "https://two.zec.rocks:443", tier: "registry" });
  expect(race.mock.calls[1][0].map((s: ServerClass) => s.uri)).toEqual([
    "https://one.zec.rocks:443",
    "https://two.zec.rocks:443",
  ]);
});

test("races the static list, minus what was tried, when the registry is silent too", async () => {
  answering("https://eu.zec.rocks:443");

  expect(await pickAutoServer(MAIN)).toEqual({ uri: "https://eu.zec.rocks:443", tier: "static" });
  const staticRace = race.mock.calls[2][0].map((s: ServerClass) => s.uri);
  expect(staticRace).not.toContain(ZAINO);
  expect(staticRace).not.toContain("https://one.zec.rocks:443");
});

test("lands on the default server, Zaino, when no server answers", async () => {
  expect(await pickAutoServer(MAIN)).toEqual({ uri: ZAINO, tier: "default" });
});

test("offers no tier a server rotated away from", async () => {
  answering(ZAINO, "https://one.zec.rocks:443", "https://two.zec.rocks:443");

  expect(await pickAutoServer(MAIN, { avoided: [ZAINO, "https://one.zec.rocks:443"] })).toEqual({
    uri: "https://two.zec.rocks:443",
    tier: "registry",
  });
});

// A rejected server beats no server at launch; rotating must not land on it.
test("keeps the default even when rotated away from, unless told not to", async () => {
  expect(await pickAutoServer(MAIN, { avoided: [ZAINO] })).toEqual({ uri: ZAINO, tier: "default" });
  expect(await pickAutoServer(MAIN, { avoided: [ZAINO], defaultEvenIfAvoided: false })).toBeNull();
});

test("uses the registry list it is handed instead of asking again", async () => {
  answering("https://handed.zec.rocks:443");

  expect(await pickAutoServer(MAIN, { live: [server("https://handed.zec.rocks:443")] })).toEqual({
    uri: "https://handed.zec.rocks:443",
    tier: "registry",
  });
  expect(liveList).not.toHaveBeenCalled();
});

test("has nothing for a chain with no default", async () => {
  liveList.mockResolvedValue([]);

  expect(await pickAutoServer(ServerChainNameEnum.regtestChainName)).toBeNull();
});
