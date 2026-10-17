import { ServerChainNameEnum, ServerClass } from "../components/appstate";
import selectFastestServer from "./selectFastestServer";
import { pickRecommended, recommendedServers, withRecommended } from "./recommendedServers";

jest.mock("../electronBridge");
jest.mock("./selectFastestServer");

const race = selectFastestServer as jest.MockedFunction<typeof selectFastestServer>;
const ZAINO = "https://mainnet.zainod.zingolabs.dev:443";

const server = (uri: string): ServerClass => ({
  uri,
  chain_name: ServerChainNameEnum.mainChainName,
  latency: null,
  default: false,
  obsolete: false,
});

beforeEach(() => {
  race.mockReset().mockResolvedValue(null);
});

test("mainnet recommends the Zaino server, which is also its default", () => {
  const [zaino] = recommendedServers(ServerChainNameEnum.mainChainName);
  expect(zaino.uri).toBe(ZAINO);
  expect(zaino.default).toBe(true);
  expect(recommendedServers(ServerChainNameEnum.testChainName)).toEqual([]);
});

test("a recommended server the user moved away from is not recommended", () => {
  expect(recommendedServers(ServerChainNameEnum.mainChainName, [ZAINO])).toEqual([]);
});

test("picks the recommended server when it answers, and nothing when it does not", async () => {
  race.mockImplementation(async (servers: ServerClass[]) => servers[0] ?? null);
  expect(await pickRecommended(ServerChainNameEnum.mainChainName)).toBe(ZAINO);

  race.mockResolvedValue(null);
  expect(await pickRecommended(ServerChainNameEnum.mainChainName)).toBeNull();
});

test("lists the recommended server first, once", () => {
  const listed = withRecommended(ServerChainNameEnum.mainChainName, [
    server("https://one.zec.rocks:443"),
    server(ZAINO),
  ]);
  expect(listed.map((s: ServerClass) => s.uri)).toEqual([ZAINO, "https://one.zec.rocks:443"]);
});
