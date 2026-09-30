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
import { deriveServerHealth, INITIAL_SERVER_HEALTH, ServerHealthState } from "./components/serverHealth";
import { SyncStatusType, WalletType } from "../components/appstate";

// Hoisted above the imports by the transform, so the bridge is the mock.
jest.mock("../electronBridge");

const answering = (name: string, answer: string) =>
  (native[name as keyof typeof native] as unknown as jest.Mock).mockResolvedValue(answer);

const failedPoll = (recovery: string, reason = "Error: Invalid shielded protocol value.") =>
  JSON.stringify({ sync_failed: { recovery, reason } });

type Published = {
  errors: { command: string; error: string }[];
  health: ServerHealthState[];
  status: SyncStatusType[];
};

const walletOn = (uri: string) => ({ uri, chain_name: "main" }) as unknown as WalletType;

const makeRpc = (uri = "https://one.example:443"): { rpc: RPC; published: Published } => {
  const published: Published = { errors: [], health: [], status: [] };
  const setters = Array.from({ length: 12 }, () => jest.fn());
  // fnSetFetchError is the tenth, fnSetServerHealth the twelfth.
  setters[9] = jest.fn((command: unknown, error: unknown) =>
    published.errors.push({ command: command as string, error: error as string }),
  );
  setters[7] = jest.fn((status: unknown) => published.status.push(status as SyncStatusType));
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

  // What happened in the field: a window left unfocused for twenty minutes and
  // the connection gone stale. zingolib now reads the failure's source chain
  // and calls that recoverable, so the cycle carries on and the server keeps
  // its record — a dropped connection says nothing about whether this server
  // can serve this wallet.
  it("keeps relaunching after a timeout", async () => {
    const { rpc, published } = makeRpc();
    const timeout =
      "server error ← server request failed ← code: 'The operation was cancelled', " +
      'message: "Timeout expired", source: tonic::transport::Error(Transport, TimeoutExpired(())) ' +
      "← transport error ← Timeout expired";
    answering("poll_sync", failedPoll("maybe_recoverable_server", timeout));
    await rpc.fetchSyncPoll();

    answering("poll_sync", "Sync task has not been launched.");
    await rpc.fetchSyncPoll();

    expect(rpc.refreshSync).toHaveBeenCalled();
    expect(deriveServerHealth(published.health.at(-1) ?? INITIAL_SERVER_HEALTH)).not.toBe("unusable");
  });

  // The bound zingolib asks for: weather passes, and a server that fails the
  // same way every time does not. The two are indistinguishable until one of
  // them stops happening, so the retries are counted.
  it("gives up on a recoverable failure that keeps happening", async () => {
    const { rpc, published } = makeRpc();
    answering("poll_sync", failedPoll("maybe_recoverable_server", "transport error ← Timeout expired"));
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await rpc.fetchSyncPoll();
    }

    answering("poll_sync", "Sync task has not been launched.");
    await rpc.fetchSyncPoll();

    expect(rpc.refreshSync).not.toHaveBeenCalled();
    expect(deriveServerHealth(published.health.at(-1) as ServerHealthState)).toBe("unusable");
    expect(published.errors.at(-1)?.error).toBe("This server cannot serve this wallet. Switch to another server.");
  });

  it("keeps relaunching when the library calls the failure recoverable", async () => {
    const { rpc } = makeRpc();
    answering("poll_sync", failedPoll("maybe_recoverable_server", "transport error ← Timeout expired"));
    await rpc.fetchSyncPoll();

    answering("poll_sync", "Sync task has not been launched.");
    await rpc.fetchSyncPoll();

    expect(rpc.refreshSync).toHaveBeenCalled();
  });

  // The figures a dead session left behind are what the screen goes on
  // drawing, and they do not age. Saying which world they belong to is the
  // difference between a wallet that is up to date and one that stopped being
  // told.
  it("marks the status it publishes as stopped", async () => {
    const { rpc, published } = makeRpc();
    jest.spyOn(rpc, "fetchSyncStatus").mockRestore();
    answering("status_sync", JSON.stringify({ percentage_total_outputs_scanned: 100 }));

    answering("poll_sync", failedPoll("server_unavailable"));
    await rpc.fetchSyncPoll();

    // Said with the failure, not five seconds later.
    expect(published.status.at(-1)?.stopped).toBe(true);

    // And again on the poll that finds no session, which is the only reply
    // there is once the cycle stops launching them.
    answering("poll_sync", "Sync task has not been launched.");
    await rpc.fetchSyncPoll();

    expect(published.status.at(-1)?.stopped).toBe(true);
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
