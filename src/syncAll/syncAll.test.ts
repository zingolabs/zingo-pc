import {
  CreationTypeEnum,
  PerformanceLevelEnum,
  ServerChainNameEnum,
  ServerSelectionEnum,
  WalletType,
} from "../components/appstate";
import { parseSessionPoll } from "./nativeSyncAllDeps";
import { LAUNCHES_BEFORE_GIVING_UP, SessionPoll, SyncAllDeps, WalletProgress, runSyncAll } from "./runSyncAll";
import { syncAllOrder } from "./syncAllOrder";

jest.mock("../electronBridge");

const wallet = (id: number, chain_name: ServerChainNameEnum = ServerChainNameEnum.mainChainName): WalletType => ({
  id,
  fileName: `wallet-${id}.dat`,
  alias: `Wallet ${id}`,
  chain_name,
  creationType: CreationTypeEnum.Main,
  uri: `https://server-${id}`,
  selection: ServerSelectionEnum.list,
  performanceLevel: PerformanceLevelEnum.High,
});

describe("syncAllOrder", () => {
  it("goes by network, mainnet first, and by id within one", () => {
    const ordered = syncAllOrder([
      wallet(7, ServerChainNameEnum.regtestChainName),
      wallet(5, ServerChainNameEnum.testChainName),
      wallet(4, ServerChainNameEnum.mainChainName),
      wallet(2, ServerChainNameEnum.testChainName),
      wallet(1, ServerChainNameEnum.mainChainName),
    ]);

    expect(ordered.map((w) => w.id)).toEqual([1, 4, 2, 5, 7]);
  });

  it("leaves the list it was given as it was", () => {
    const wallets = [wallet(2), wallet(1)];
    syncAllOrder(wallets);
    expect(wallets.map((w) => w.id)).toEqual([2, 1]);
  });
});

describe("parseSessionPoll", () => {
  it("reads zingolib's replies", () => {
    expect(parseSessionPoll("Sync task is not complete.")).toEqual({ kind: "running" });
    expect(parseSessionPoll("Sync task has not been launched.")).toEqual({ kind: "idle" });
    expect(parseSessionPoll('{"sync_complete":{}}')).toEqual({ kind: "completed" });
    expect(parseSessionPoll('{"sync_failed":{"recovery":"server_unavailable","reason":"no tree state"}}')).toEqual({
      kind: "failed",
      reason: "no tree state",
      recovery: "server_unavailable",
    });
  });
});

/**
 * A run against wallets whose sessions answer from a script: each wallet id
 * maps to the polls its session gives, in order. A session past the end of
 * its script is at the tip.
 */
const scripted = (polls: Record<number, SessionPoll[]>, overrides: Partial<SyncAllDeps> = {}) => {
  const calls: string[] = [];
  let open = 0;
  const cursor: Record<number, number> = {};
  const deps: SyncAllDeps = {
    resolveServer: async (w) => w.uri,
    walletExists: async () => true,
    open: async (w) => {
      open = w.id;
      calls.push(`open ${w.id}`);
    },
    launch: async () => {
      calls.push(`launch ${open}`);
    },
    poll: async () => {
      const at = cursor[open] ?? 0;
      cursor[open] = at + 1;
      return polls[open]?.[at] ?? { kind: "running" };
    },
    progress: async () => ({ caughtUp: (cursor[open] ?? 0) > (polls[open]?.length ?? 0), percent: null }),
    stop: async () => {
      calls.push(`stop ${open}`);
    },
    save: async () => {
      calls.push(`save ${open}`);
    },
    close: async () => {
      calls.push(`close ${open}`);
    },
    sleep: async () => {},
    ...overrides,
  };
  const seen: Record<number, WalletProgress> = {};
  const onProgress = (id: number, progress: WalletProgress) => {
    seen[id] = progress;
  };
  return { deps, calls, seen, onProgress };
};

/** Controls for a run nobody touches, unless told otherwise. */
const run = (
  cancelled: () => boolean = () => false,
  takeSkip: () => boolean = () => false,
  isOpen: (walletId: number) => boolean = () => false,
) => ({ cancelled, takeSkip, isOpen });

const weather: SessionPoll = { kind: "failed", reason: "Timeout expired", recovery: "maybe_recoverable_server" };

describe("runSyncAll", () => {
  it("opens, syncs, stops and saves each wallet before the next is opened", async () => {
    const { deps, calls, seen, onProgress } = scripted({});

    await runSyncAll([wallet(1), wallet(2)], deps, onProgress, run());

    expect(calls).toEqual([
      "open 1",
      "launch 1",
      "stop 1",
      "save 1",
      "close 1",
      "open 2",
      "launch 2",
      "stop 2",
      "save 2",
      "close 2",
    ]);
    expect(seen).toEqual({ 1: { kind: "synced" }, 2: { kind: "synced" } });
  });

  // One dead server must not cost the user the wallets after it.
  it("records a wallet that cannot be synced and carries on", async () => {
    const { deps, seen, onProgress } = scripted({
      1: [{ kind: "failed", reason: "no tree state", recovery: "server_unavailable" }],
    });

    await runSyncAll([wallet(1), wallet(2)], deps, onProgress, run());

    expect(seen[1]).toEqual({ kind: "failed", reason: "This server cannot serve this wallet." });
    expect(seen[2]).toEqual({ kind: "synced" });
  });

  it("launches a session again after passing weather", async () => {
    const { deps, calls, seen, onProgress } = scripted({ 1: [weather] });

    await runSyncAll([wallet(1)], deps, onProgress, run());

    expect(calls.filter((c) => c === "launch 1")).toHaveLength(2);
    expect(seen[1]).toEqual({ kind: "synced" });
  });

  it("gives a wallet up once its session has failed too many times in a row", async () => {
    const { deps, calls, seen, onProgress } = scripted({ 1: Array(LAUNCHES_BEFORE_GIVING_UP).fill(weather) });

    await runSyncAll([wallet(1)], deps, onProgress, run());

    expect(calls.filter((c) => c === "launch 1")).toHaveLength(LAUNCHES_BEFORE_GIVING_UP);
    // Said without "reconnecting": nothing is going to try again.
    expect(seen[1]).toEqual({ kind: "failed", reason: "The server stopped answering." });
  });

  it("does not open a wallet whose file is gone", async () => {
    const { deps, calls, seen, onProgress } = scripted({}, { walletExists: async (w) => w.id !== 1 });

    await runSyncAll([wallet(1), wallet(2)], deps, onProgress, run());

    expect(calls).not.toContain("open 1");
    expect(seen[1]).toEqual({ kind: "failed", reason: "The wallet file was not found." });
    expect(seen[2]).toEqual({ kind: "synced" });
  });

  it("turns a wallet that will not open into its reason", async () => {
    const { deps, seen, onProgress } = scripted(
      {},
      {
        open: async () => {
          throw new Error("Error: init: the wallet file is corrupt");
        },
      },
    );

    await runSyncAll([wallet(1)], deps, onProgress, run());

    expect(seen[1]).toEqual({ kind: "failed", reason: "init: the wallet file is corrupt" });
  });

  // Cancelling stops the wallet in hand cleanly, so what it had scanned is
  // kept, and opens no other.
  it("stops and saves the wallet in hand on cancel, and opens no other", async () => {
    let cancelled = false;
    const { deps, calls, seen, onProgress } = scripted(
      { 1: [{ kind: "running" }, { kind: "running" }, { kind: "running" }] },
      {
        sleep: async () => {
          cancelled = true;
        },
      },
    );

    await runSyncAll(
      [wallet(1), wallet(2)],
      deps,
      onProgress,
      run(() => cancelled),
    );

    expect(calls).toEqual(["open 1", "launch 1", "stop 1", "save 1", "close 1"]);
    expect(seen).toEqual({ 1: { kind: "cancelled" }, 2: { kind: "cancelled" } });
  });

  // The wallet in hand is stopped and saved like any other, and the run goes
  // on to the next; a skip asked while the previous wallet was closing is not
  // carried over to this one.
  it("skips the wallet in hand and carries on with the next", async () => {
    let skip = false;
    const { deps, calls, seen, onProgress } = scripted(
      { 1: [{ kind: "running" }, { kind: "running" }] },
      {
        sleep: async () => {
          skip = true;
        },
      },
    );
    const takeSkip = () => {
      const asked = skip;
      skip = false;
      return asked;
    };

    await runSyncAll(
      [wallet(1), wallet(2)],
      deps,
      onProgress,
      run(() => false, takeSkip),
    );

    expect(calls.filter((c) => c.startsWith("open"))).toEqual(["open 1", "open 2"]);
    expect(seen).toEqual({ 1: { kind: "skipped" }, 2: { kind: "synced" } });
  });

  // Its own session syncs it, and a wallet file held by two clients would
  // have each overwrite the other's scans.
  it("never opens the wallet that is on screen", async () => {
    const { deps, calls, seen, onProgress } = scripted({});

    await runSyncAll(
      [wallet(1), wallet(2)],
      deps,
      onProgress,
      run(
        () => false,
        () => false,
        (id) => id === 1,
      ),
    );

    expect(calls).not.toContain("open 1");
    expect(seen).toEqual({ 1: { kind: "open" }, 2: { kind: "synced" } });
  });

  // The user opens the wallet the run has in hand: the app asks the run to
  // let go, and the slot is emptied before the screen may open the file.
  it("lets go of the wallet in hand when the user opens it on screen", async () => {
    let onScreen = 0;
    let asked = false;
    const { deps, calls, seen, onProgress } = scripted(
      { 1: [{ kind: "running" }, { kind: "running" }] },
      {
        sleep: async () => {
          onScreen = 1;
          asked = true;
        },
      },
    );
    const takeSkip = () => {
      const was = asked;
      asked = false;
      return was;
    };

    await runSyncAll(
      [wallet(1), wallet(2)],
      deps,
      onProgress,
      run(
        () => false,
        takeSkip,
        (id) => id === onScreen,
      ),
    );

    expect(calls.slice(0, 5)).toEqual(["open 1", "launch 1", "stop 1", "save 1", "close 1"]);
    expect(seen).toEqual({ 1: { kind: "open" }, 2: { kind: "synced" } });
  });

  it("reports the server and the progress while a wallet syncs", async () => {
    const reported: WalletProgress[] = [];
    let asked = 0;
    const { deps } = scripted({}, { progress: async () => ({ caughtUp: (asked += 1) > 1, percent: 42.5 }) });

    await runSyncAll([wallet(1)], deps, (_id, progress) => reported.push(progress), run());

    expect(reported[0]).toEqual({ kind: "syncing", server: "", percent: null });
    expect(reported).toContainEqual({ kind: "syncing", server: "https://server-1", percent: 42.5 });
    expect(reported[reported.length - 1]).toEqual({ kind: "synced" });
  });
});
