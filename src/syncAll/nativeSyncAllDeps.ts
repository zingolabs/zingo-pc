import { native } from "../electronBridge";
import { ServerChainNameEnum, ServerSelectionEnum, WalletType } from "../components/appstate";
import pickRotationTarget from "../utils/pickRotationTarget";
import { SessionPoll, SyncAllDeps } from "./runSyncAll";

// The same wallet-file arguments the loading screen opens a wallet with.
const MIN_CONFIRMATIONS = 3;

const STOP_TIMEOUT_MS = 30 * 1000;
const STOP_POLL_MS = 200;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** zingolib's replies to `poll_sync`, as the run reads them. */
export function parseSessionPoll(reply: string): SessionPoll {
  const lower = reply.toLowerCase();
  if (lower.startsWith("sync task is not complete")) return { kind: "running" };
  if (lower.startsWith("sync task has not been launched")) return { kind: "idle" };
  try {
    const parsed = JSON.parse(reply);
    if (parsed.sync_failed) {
      return { kind: "failed", reason: parsed.sync_failed.reason ?? "", recovery: parsed.sync_failed.recovery };
    }
    return { kind: "completed" };
  } catch {
    return { kind: "failed", reason: reply };
  }
}

/**
 * The run's hands on the wallet and the network: the native module's
 * background slot, which holds a wallet beside the one on screen.
 *
 * One instance per run: it remembers the server picked for each network, so
 * every `auto` wallet on a network syncs from the same one and the race is
 * run once, as a launch does.
 */
export function nativeSyncAllDeps(): SyncAllDeps {
  const autoPicked = new Map<ServerChainNameEnum, string>();

  return {
    resolveServer: async (wallet: WalletType): Promise<string> => {
      // `list` and `custom` are servers the user named. Only `auto` is ours
      // to choose, and it chooses the way it does when the wallet is opened.
      if (wallet.selection !== ServerSelectionEnum.auto) return wallet.uri;
      const already = autoPicked.get(wallet.chain_name);
      if (already) return already;
      const picked = (await pickRotationTarget(wallet.chain_name, [])) ?? wallet.uri;
      autoPicked.set(wallet.chain_name, picked);
      return picked;
    },

    walletExists: (wallet: WalletType, server: string): Promise<boolean> =>
      native.wallet_exists(server, wallet.chain_name, wallet.performanceLevel, MIN_CONFIRMATIONS, wallet.fileName),

    open: async (wallet: WalletType, server: string): Promise<void> => {
      await native.background_open(
        server,
        wallet.chain_name,
        wallet.performanceLevel,
        MIN_CONFIRMATIONS,
        wallet.fileName,
      );
    },

    launch: async (): Promise<void> => {
      await native.background_run_sync();
    },

    poll: async (): Promise<SessionPoll> => parseSessionPoll(await native.background_poll_sync()),

    progress: async (): Promise<{ caughtUp: boolean; percent: number | null }> => {
      const { caught_up, percent } = JSON.parse(await native.background_sync_caught_up());
      return { caughtUp: caught_up === true, percent: typeof percent === "number" ? percent : null };
    },

    stop: async (): Promise<void> => {
      await native.background_stop_sync();
      // Bounded: a session that will not end must not hold the run for ever.
      // The save that follows still writes what the wallet holds.
      const deadline = Date.now() + STOP_TIMEOUT_MS;
      while (Date.now() < deadline) {
        if (parseSessionPoll(await native.background_poll_sync()).kind !== "running") return;
        await sleep(STOP_POLL_MS);
      }
    },

    save: async (): Promise<void> => {
      await native.background_save();
    },

    close: async (): Promise<void> => {
      await native.background_close();
    },

    sleep,
  };
}

export default nativeSyncAllDeps;
