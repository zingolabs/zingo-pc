import { ServerChainNameEnum, ServerClass } from "../components/appstate";
import fetchServerList from "./fetchServerList";
import selectFastestServer from "./selectFastestServer";
import pickRotationTarget from "./pickRotationTarget";

// Automocking the two helpers still loads them to derive their shape, and they
// reach the electron bridge on the way in.
jest.mock("../electronBridge");
jest.mock("./fetchServerList");
jest.mock("./selectFastestServer");

const liveList = fetchServerList as jest.MockedFunction<typeof fetchServerList>;
const race = selectFastestServer as jest.MockedFunction<typeof selectFastestServer>;

const server = (uri: string, chain = ServerChainNameEnum.mainChainName): ServerClass => ({
  uri,
  chain_name: chain,
  latency: null,
  default: false,
  obsolete: false,
});

beforeEach(() => {
  liveList.mockReset().mockResolvedValue([]);
  race.mockReset().mockResolvedValue(null);
});

test("takes the registry's first entry", async () => {
  liveList.mockResolvedValue([server("https://one.zec.rocks:443"), server("https://two.zec.rocks:443")]);

  expect(await pickRotationTarget(ServerChainNameEnum.mainChainName, "https://old.zec.rocks:443")).toBe(
    "https://one.zec.rocks:443",
  );
});

// The whole point of rotating is to leave the server that is not answering.
test("never returns the server it was asked to leave", async () => {
  liveList.mockResolvedValue([server("https://old.zec.rocks:443"), server("https://two.zec.rocks:443")]);

  expect(await pickRotationTarget(ServerChainNameEnum.mainChainName, "https://old.zec.rocks:443")).toBe(
    "https://two.zec.rocks:443",
  );
});

test("races the static list when the registry says nothing", async () => {
  race.mockResolvedValue(server("https://eu.zec.rocks:443"));

  expect(await pickRotationTarget(ServerChainNameEnum.mainChainName, "https://zec.rocks:443")).toBe(
    "https://eu.zec.rocks:443",
  );
  const raced = race.mock.calls[0][0].map((s: ServerClass) => s.uri);
  expect(raced).not.toContain("https://zec.rocks:443");
  expect(raced.length).toBeGreaterThan(0);
});

test("falls back to the server we ship for the chain when none answer", async () => {
  expect(await pickRotationTarget(ServerChainNameEnum.testChainName, "https://zcash.mysideoftheweb.com:19067")).toBe(
    "https://testnet.zec.rocks:443",
  );
});

test("stays on the wallet's chain", async () => {
  race.mockImplementation(async (servers: ServerClass[]) => servers[0] ?? null);

  const target = await pickRotationTarget(ServerChainNameEnum.testChainName, "https://testnet.zec.rocks:443");

  expect(target).toBe("https://zcash.mysideoftheweb.com:19067");
});

test("gives up rather than rotating to nothing", async () => {
  expect(await pickRotationTarget(ServerChainNameEnum.regtestChainName, "http://127.0.0.1:9067")).toBeNull();
});
