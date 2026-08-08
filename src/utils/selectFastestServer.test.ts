import { native } from "../electronBridge";
import { ServerChainNameEnum, ServerClass } from "../components/appstate";
import selectFastestServer from "./selectFastestServer";

jest.mock("../electronBridge");

const probe = native.get_latest_block_server as jest.Mock;

const server = (uri: string): ServerClass => ({
  uri,
  chain_name: ServerChainNameEnum.mainChainName,
  latency: null,
  default: false,
  obsolete: false,
});

beforeEach(() => {
  probe.mockReset();
});

// An empty list used to sit out the whole 15s timeout waiting for nobody, which
// stalled the launch of any wallet on a chain we publish no servers for.
test("an empty list resolves at once, without probing", async () => {
  expect(await selectFastestServer([])).toBeNull();
  expect(probe).not.toHaveBeenCalled();
});

test("the first server to answer wins", async () => {
  probe.mockImplementation((uri: string) =>
    uri === "https://slow.example.com:443" ? new Promise(() => {}) : Promise.resolve("2500000"),
  );

  const fastest = await selectFastestServer([
    server("https://slow.example.com:443"),
    server("https://quick.example.com:443"),
  ]);

  expect(fastest?.uri).toBe("https://quick.example.com:443");
});

test("the winner carries the latency it answered in", async () => {
  probe.mockResolvedValue("2500000");

  const fastest = await selectFastestServer([server("https://quick.example.com:443")]);

  expect(typeof fastest?.latency).toBe("number");
});

// A server that throws is out of the race, not a crash.
test("a throwing server drops out and leaves the rest running", async () => {
  probe.mockImplementation((uri: string) =>
    uri === "https://broken.example.com:443"
      ? Promise.reject(new Error("connection refused"))
      : Promise.resolve("2500000"),
  );

  const fastest = await selectFastestServer([
    server("https://broken.example.com:443"),
    server("https://ok.example.com:443"),
  ]);

  expect(fastest?.uri).toBe("https://ok.example.com:443");
});
