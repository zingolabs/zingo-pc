/**
 * What the cycle does with a sync session that failed.
 *
 * zingolib classifies every sync failure, and the classification is the whole
 * point: a dropped connection is worth asking the same server again, and the
 * next poll opens a fresh connection. A server that cannot serve this wallet —
 * one missing a pool the wallet needs — stays that way however many times it
 * is asked, and the app used to ask every fifteen seconds for as long as it
 * was open, showing the last status the engine managed to publish. A wallet
 * falling further behind with every block looked like one at 99.99%.
 */
import { native } from "../electronBridge";
import RPC from "./rpc";
import { deriveServerHealth, ServerHealthState } from "./components/serverHealth";
import { WalletType } from "../components/appstate";

// Hoisted above the imports by the transform, so the bridge is the mock.
jest.mock("../electronBridge");

const answering = (name: string, answer: string) =>
  (native[name as keyof typeof native] as unknown as jest.Mock).mockResolvedValue(answer);

const failedPoll = (recovery: string, reason = "Error: Invalid shielded protocol value.") =>
  JSON.stringify({ sync_failed: { recovery, reason } });

type Published = {
  errors: { command: string; error: string }[];
  health: ServerHealthState[];
};

const walletOn = (uri: string) => ({ uri, chain_name: "main" }) as unknown as WalletType;

const makeRpc = (uri = "https://one.example:443"): { rpc: RPC; published: Published } => {
  const published: Published = { errors: [], health: [] };
  const setters = Array.from({ length: 12 }, () => jest.fn());
  // fnSetFetchError is the tenth, fnSetServerHealth the twelfth.
  setters[9] = jest.fn((command: unknown, error: unknown) =>
    published.errors.push({ command: command as string, error: error as string }),
  );
  setters[11] = jest.fn((health: unknown) => published.health.push(health as ServerHealthState));
  const rpc = new (RPC as unknown as new (...args: unknown[]) => RPC)(...setters, walletOn(uri));
  jest.spyOn(rpc, "refreshSync").mockImplementation(async () => {});
  jest.spyOn(rpc, "fetchSyncStatus").mockImplementation(async () => {});
  return { rpc, published };
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("a sync session that failed", () => {
  it("stops the cycle relaunching against a server that cannot serve the wallet", async () => {
    const { rpc, published } = makeRpc();
    answering("poll_sync", failedPoll("server_unavailable"));
    await rpc.fetchSyncPoll();

    // The next poll finds no session — which is the branch that launches one.
    answering("poll_sync", "Sync task has not been launched.");
    await rpc.fetchSyncPoll();

    expect(rpc.refreshSync).not.toHaveBeenCalled();
    expect(published.errors.at(-1)?.error).toBe("This server cannot serve this wallet. Switch to another server.");
    expect(deriveServerHealth(published.health.at(-1) as ServerHealthState)).toBe("unusable");
  });

  it("says so at once rather than waiting for a second failure", async () => {
    // A dropped connection is given one poll to recover before anything is
    // said; this will not recover, so saying it late only delays the remedy.
    const { rpc, published } = makeRpc();
    answering("poll_sync", failedPoll("server_unavailable"));

    await rpc.fetchSyncPoll();

    expect(published.errors).toHaveLength(1);
  });

  it("keeps relaunching when the library calls the failure recoverable", async () => {
    const { rpc } = makeRpc();
    answering("poll_sync", failedPoll("maybe_recoverable_server", "transport error ← Timeout expired"));
    await rpc.fetchSyncPoll();

    answering("poll_sync", "Sync task has not been launched.");
    await rpc.fetchSyncPoll();

    expect(rpc.refreshSync).toHaveBeenCalled();
  });

  it("clears the mark when the user moves to another server", async () => {
    const { rpc, published } = makeRpc("https://refuses.example:443");
    answering("poll_sync", failedPoll("server_unavailable"));
    await rpc.fetchSyncPoll();
    expect(deriveServerHealth(published.health.at(-1) as ServerHealthState)).toBe("unusable");

    // What every switch of server ends in, whatever route the user took to it.
    rpc.setCurrentWallet(walletOn("https://serves.example:443"));
    jest.spyOn(rpc, "fetchTandZandOValueTransfers").mockResolvedValue(undefined as never);
    await rpc.configure();

    expect(deriveServerHealth(published.health.at(-1) as ServerHealthState)).not.toBe("unusable");
    answering("poll_sync", "Sync task has not been launched.");
    await rpc.fetchSyncPoll();
    expect(rpc.refreshSync).toHaveBeenCalled();
  });

  it("holds the verdict against this server until something changes", async () => {
    const { rpc } = makeRpc();
    answering("poll_sync", failedPoll("server_unavailable"));
    await rpc.fetchSyncPoll();

    // A switch of server, a new wallet, a spend that stopped the engine: each
    // ends with the cycle being set up again, and the reason a session that is
    // over could not sync says nothing about the next one.
    rpc.resetServerHealth();
    answering("poll_sync", "Sync task has not been launched.");
    await rpc.fetchSyncPoll();

    expect(rpc.refreshSync).toHaveBeenCalled();
  });
});
