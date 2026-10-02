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
    caughtUp: async () => (cursor[open] ?? 0) > (polls[open]?.length ?? 0),
    percent: async () => null,
    stop: async () => {
      calls.push(`stop ${open}`);
    },
    save: async () => {
      calls.push(`save ${open}`);
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

const weather: SessionPoll = { kind: "failed", reason: "Timeout expired", recovery: "maybe_recoverable_server" };

describe("runSyncAll", () => {
  it("opens, syncs, stops and saves each wallet before the next is opened", async () => {
    const { deps, calls, seen, onProgress } = scripted({});

    await runSyncAll([wallet(1), wallet(2)], deps, onProgress, () => false);

    expect(calls).toEqual(["open 1", "launch 1", "stop 1", "save 1", "open 2", "launch 2", "stop 2", "save 2"]);
    expect(seen).toEqual({ 1: { kind: "synced" }, 2: { kind: "synced" } });
  });

  // One dead server must not cost the user the wallets after it.
  it("records a wallet that cannot be synced and carries on", async () => {
    const { deps, seen, onProgress } = scripted({
      1: [{ kind: "failed", reason: "no tree state", recovery: "server_unavailable" }],
    });

    await runSyncAll([wallet(1), wallet(2)], deps, onProgress, () => false);

    expect(seen[1]).toEqual({ kind: "failed", reason: "This server cannot serve this wallet." });
    expect(seen[2]).toEqual({ kind: "synced" });
  });

  it("launches a session again after passing weather", async () => {
    const { deps, calls, seen, onProgress } = scripted({ 1: [weather] });

    await runSyncAll([wallet(1)], deps, onProgress, () => false);

    expect(calls.filter((c) => c === "launch 1")).toHaveLength(2);
    expect(seen[1]).toEqual({ kind: "synced" });
  });

  it("gives a wallet up once its session has failed too many times in a row", async () => {
    const { deps, calls, seen, onProgress } = scripted({ 1: Array(LAUNCHES_BEFORE_GIVING_UP).fill(weather) });

    await runSyncAll([wallet(1)], deps, onProgress, () => false);

    expect(calls.filter((c) => c === "launch 1")).toHaveLength(LAUNCHES_BEFORE_GIVING_UP);
    // Said without "reconnecting": nothing is going to try again.
    expect(seen[1]).toEqual({ kind: "failed", reason: "The server stopped answering." });
  });

  it("does not open a wallet whose file is gone", async () => {
    const { deps, calls, seen, onProgress } = scripted({}, { walletExists: async (w) => w.id !== 1 });

    await runSyncAll([wallet(1), wallet(2)], deps, onProgress, () => false);

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

    await runSyncAll([wallet(1)], deps, onProgress, () => false);

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

    await runSyncAll([wallet(1), wallet(2)], deps, onProgress, () => cancelled);

    expect(calls).toEqual(["open 1", "launch 1", "stop 1", "save 1"]);
    expect(seen).toEqual({ 1: { kind: "cancelled" }, 2: { kind: "cancelled" } });
  });

  it("reports the server and the progress while a wallet syncs", async () => {
    const reported: WalletProgress[] = [];
    const { deps } = scripted({ 1: [{ kind: "running" }] }, { percent: async () => 42.5 });

    await runSyncAll(
      [wallet(1)],
      deps,
      (_id, progress) => reported.push(progress),
      () => false,
    );

    expect(reported).toContainEqual({ kind: "syncing", server: "https://server-1", percent: 42.5 });
    expect(reported[reported.length - 1]).toEqual({ kind: "synced" });
  });
});
