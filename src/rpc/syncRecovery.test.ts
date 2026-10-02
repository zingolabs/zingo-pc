/**
 * What the cycle does with a sync session that failed.
 *
 * A server answers with an error of some kind every so often, whatever zingolib
 * calls it, and one such answer says nothing about the next. The cycle stops
 * launching sessions only once a failure has held: six sessions in a row, over
 * at least two minutes, with no block scanned between them. Then zingolib's
 * classification decides what the screen says: a server that cannot serve this
 * wallet, or a wallet that needs a rescan.
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

const shardTree =
  "shard tree error ← Inserted root conflicts with existing root at address Address { level: Level(5), index: 10850 }";

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

let now = 0;

// One failed session as the cycle sees it: the failure, then the poll that
// finds no engine left behind.
const failSession = async (rpc: RPC, recovery: string, reason?: string, secondsLater = 30) => {
  now += secondsLater * 1000;
  answering("poll_sync", failedPoll(recovery, reason));
  await rpc.fetchSyncPoll();
  answering("poll_sync", "Sync task has not been launched.");
  await rpc.fetchSyncPoll();
};

const failSessions = async (rpc: RPC, count: number, recovery: string, reason?: string, secondsApart = 30) => {
  for (let session = 0; session < count; session += 1) {
    await failSession(rpc, recovery, reason, secondsApart);
  }
};

beforeEach(() => {
  jest.clearAllMocks();
  now = 1_000_000;
  jest.spyOn(Date, "now").mockImplementation(() => now);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("a sync session that failed", () => {
  it("relaunches after one failure the library calls a server it cannot use", async () => {
    const { rpc, published } = makeRpc();
    await failSession(rpc, "server_unavailable");

    expect(rpc.refreshSync).toHaveBeenCalled();
    expect(published.errors).toHaveLength(0);
    expect(deriveServerHealth(published.health.at(-1) ?? INITIAL_SERVER_HEALTH)).not.toBe("unusable");
  });

  it("stops relaunching once a server failure has held for six sessions over two minutes", async () => {
    const { rpc, published } = makeRpc();
    await failSessions(rpc, 6, "server_unavailable");
    (rpc.refreshSync as jest.Mock).mockClear();

    answering("poll_sync", "Sync task has not been launched.");
    await rpc.fetchSyncPoll();

    expect(rpc.refreshSync).not.toHaveBeenCalled();
    expect(published.errors.at(-1)?.error).toBe("This server cannot serve this wallet. Switch to another server.");
    expect(deriveServerHealth(published.health.at(-1) as ServerHealthState)).toBe("unusable");
  });

  it("keeps relaunching when six failures come inside two minutes", async () => {
    const { rpc, published } = makeRpc();
    await failSessions(rpc, 6, "server_unavailable", undefined, 10);

    expect(rpc.refreshSync).toHaveBeenCalledTimes(6);
    expect(deriveServerHealth(published.health.at(-1) ?? INITIAL_SERVER_HEALTH)).not.toBe("unusable");
  });

  it("keeps relaunching when failures outlast two minutes in fewer than six sessions", async () => {
    const { rpc } = makeRpc();
    await failSessions(rpc, 5, "server_unavailable", undefined, 60);

    expect(rpc.refreshSync).toHaveBeenCalledTimes(5);
  });

  // The failures that come and go during a long sync: each session scans some
  // blocks before the connection drops, and that is a sync making its way.
  it("starts the count again when blocks are scanned between failures", async () => {
    const { rpc, published } = makeRpc();
    jest.spyOn(rpc, "fetchSyncStatus").mockRestore();
    let scanned = 1000;
    (native.status_sync as unknown as jest.Mock).mockImplementation(async () =>
      JSON.stringify({ total_blocks_scanned: scanned }),
    );

    for (let session = 0; session < 10; session += 1) {
      await failSession(rpc, "maybe_recoverable_server", "transport error ← Timeout expired");
      scanned += 500;
      await rpc.fetchSyncStatus();
    }
    (rpc.refreshSync as jest.Mock).mockClear();
    answering("poll_sync", "Sync task has not been launched.");
    await rpc.fetchSyncPoll();

    expect(rpc.refreshSync).toHaveBeenCalled();
    expect(published.status.at(-1)?.stopped).toBe(false);
  });

  it("gives up on a recoverable failure that keeps happening without progress", async () => {
    const { rpc, published } = makeRpc();
    await failSessions(rpc, 6, "maybe_recoverable_server", "transport error ← Timeout expired");
    (rpc.refreshSync as jest.Mock).mockClear();

    answering("poll_sync", "Sync task has not been launched.");
    await rpc.fetchSyncPoll();

    expect(rpc.refreshSync).not.toHaveBeenCalled();
    expect(deriveServerHealth(published.health.at(-1) as ServerHealthState)).toBe("unusable");
  });

  it("says what happened from the second failure, before the cycle gives up", async () => {
    const { rpc, published } = makeRpc();
    await failSessions(rpc, 2, "maybe_recoverable_server", "transport error ← Timeout expired");

    expect(published.errors.at(-1)?.error).toBe("The server stopped answering — reconnecting.");
  });

  // What happened in the field: a shard tree left half-written by a session
  // that was cut off. Every relaunch rescanned the same ten blocks and died on
  // the same root, and the screen said "Connecting" for as long as it was open.
  it("stops relaunching once the wallet itself has failed for six sessions over two minutes", async () => {
    const { rpc, published } = makeRpc();
    await failSessions(rpc, 6, "abort", shardTree);
    (rpc.refreshSync as jest.Mock).mockClear();

    answering("poll_sync", "Sync task has not been launched.");
    await rpc.fetchSyncPoll();

    expect(rpc.refreshSync).not.toHaveBeenCalled();
    expect(published.errors.at(-1)?.error).toBe(`Sync stopped: ${shardTree}. Rescan the wallet to recover.`);
    expect(deriveServerHealth(published.health.at(-1) ?? INITIAL_SERVER_HEALTH)).not.toBe("unusable");
  });

  // The banner clears itself twelve seconds after its last publish. A halted
  // cycle has no failures left to publish it, and the reason used to leave the
  // screen while the wallet stayed stopped.
  it("keeps the reason on screen for as long as the cycle is halted", async () => {
    const { rpc, published } = makeRpc();
    await failSessions(rpc, 6, "abort", shardTree);
    const before = published.errors.length;

    answering("poll_sync", "Sync task has not been launched.");
    await rpc.fetchSyncPoll();
    await rpc.fetchSyncPoll();

    expect(published.errors.length).toBe(before + 2);
    expect(published.errors.at(-1)?.error).toBe(`Sync stopped: ${shardTree}. Rescan the wallet to recover.`);
  });

  it("relaunches after one failure the library calls unrecoverable", async () => {
    const { rpc } = makeRpc();
    await failSession(rpc, "abort", shardTree);

    expect(rpc.refreshSync).toHaveBeenCalled();
  });

  it("launches again once the wallet is set up anew", async () => {
    const { rpc } = makeRpc();
    await failSessions(rpc, 6, "abort", shardTree);
    (rpc.refreshSync as jest.Mock).mockClear();

    // A rescan ends here, and so does reopening the wallet.
    jest.spyOn(rpc, "fetchTandZandOValueTransfers").mockResolvedValue(undefined as never);
    await rpc.configure();
    answering("poll_sync", "Sync task has not been launched.");
    await rpc.fetchSyncPoll();

    expect(rpc.refreshSync).toHaveBeenCalled();
  });

  // The figures a dead session left behind are what the screen goes on
  // drawing, and they do not age. Saying which world they belong to is the
  // difference between a wallet that is up to date and one that stopped being
  // told.
  it("marks the status it publishes as stopped once the cycle gives up", async () => {
    const { rpc, published } = makeRpc();
    jest.spyOn(rpc, "fetchSyncStatus").mockRestore();
    answering("status_sync", JSON.stringify({ percentage_total_outputs_scanned: 100 }));

    await failSessions(rpc, 6, "server_unavailable");

    expect(published.status.at(-1)?.stopped).toBe(true);
  });

  it("clears the mark when the user moves to another server", async () => {
    const { rpc, published } = makeRpc("https://refuses.example:443");
    await failSessions(rpc, 6, "server_unavailable");
    expect(deriveServerHealth(published.health.at(-1) as ServerHealthState)).toBe("unusable");
    (rpc.refreshSync as jest.Mock).mockClear();

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
    await failSessions(rpc, 6, "server_unavailable");
    (rpc.refreshSync as jest.Mock).mockClear();

    // A switch of server, a new wallet, a spend that stopped the engine: each
    // ends with the cycle being set up again, and the reason a session that is
    // over could not sync says nothing about the next one.
    rpc.resetServerHealth();
    answering("poll_sync", "Sync task has not been launched.");
    await rpc.fetchSyncPoll();

    expect(rpc.refreshSync).toHaveBeenCalled();
  });
});
