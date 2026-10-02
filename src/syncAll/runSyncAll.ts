import { WalletType } from "../components/appstate";
import { SyncRecovery, isConnectionFailure } from "../rpc/syncFailureMessage";
import userFacingError from "../utils/userFacingError";

/**
 * Syncs every wallet to the chain tip, one after another.
 *
 * The native module holds one wallet at a time, so a run is a sequence: open,
 * sync to the tip, stop, save, and on to the next. A wallet that cannot be
 * synced is recorded with its reason and the run moves on, because one dead
 * server should not cost the user the wallets after it.
 *
 * Everything that touches the wallet or the network comes in through `deps`,
 * so the sequence can be tested without either.
 */

export type WalletProgress =
  | { readonly kind: "pending" }
  | { readonly kind: "syncing"; readonly server: string; readonly percent: number | null }
  | { readonly kind: "synced" }
  | { readonly kind: "failed"; readonly reason: string }
  // The run was cancelled: this wallet was stopped mid-sync, or never started.
  | { readonly kind: "cancelled" };

export type SessionPoll =
  | { readonly kind: "running" }
  // The session returned without failing, as one configured to end at the tip does.
  | { readonly kind: "completed" }
  // No session: it ended and its result was already read.
  | { readonly kind: "idle" }
  | { readonly kind: "failed"; readonly reason: string; readonly recovery?: SyncRecovery };

export type SyncAllDeps = {
  /** The server this wallet syncs from, by its own selection mode. */
  resolveServer: (wallet: WalletType) => Promise<string>;
  walletExists: (wallet: WalletType, server: string) => Promise<boolean>;
  /** Opens the wallet, replacing whichever one the native module held. */
  open: (wallet: WalletType, server: string) => Promise<void>;
  launch: () => Promise<void>;
  poll: () => Promise<SessionPoll>;
  /**
   * Where the running session is: whether it has scanned up to the tip it
   * found, and the percentage it has published, null before its first.
   */
  progress: () => Promise<{ caughtUp: boolean; percent: number | null }>;
  /** Stops the session and returns once it has ended. */
  stop: () => Promise<void>;
  save: () => Promise<void>;
  sleep: (ms: number) => Promise<void>;
};

export const POLL_MS = 1000;
// A session that fails is launched again this many times before the wallet is
// given up on. Progress between failures starts the count over.
export const LAUNCHES_BEFORE_GIVING_UP = 3;

/** A failure the run stops trying on, said without promising a retry. */
function finalReason(reason: string, recovery?: SyncRecovery): string {
  if (recovery === "server_unavailable") return "This server cannot serve this wallet.";
  return isConnectionFailure(reason) ? "The server stopped answering." : reason;
}

async function syncOne(
  wallet: WalletType,
  deps: SyncAllDeps,
  report: (progress: WalletProgress) => void,
  cancelled: () => boolean,
): Promise<WalletProgress> {
  const server = await deps.resolveServer(wallet);
  report({ kind: "syncing", server, percent: null });

  if (!(await deps.walletExists(wallet, server))) {
    return { kind: "failed", reason: "The wallet file was not found." };
  }
  await deps.open(wallet, server);
  try {
    await deps.launch();

    let launches = 1;
    let best = -1;
    for (;;) {
      if (cancelled()) return { kind: "cancelled" };

      const poll = await deps.poll();
      if (poll.kind === "completed") return { kind: "synced" };
      if (poll.kind === "failed" || poll.kind === "idle") {
        const recoverable = poll.kind === "idle" || poll.recovery === "maybe_recoverable_server";
        if (!recoverable || launches >= LAUNCHES_BEFORE_GIVING_UP) {
          return {
            kind: "failed",
            reason: poll.kind === "failed" ? finalReason(poll.reason, poll.recovery) : "The sync session ended early.",
          };
        }
        launches += 1;
        await deps.launch();
      } else {
        const { caughtUp, percent } = await deps.progress();
        if (caughtUp) return { kind: "synced" };
        if (percent !== null && percent > best) {
          best = percent;
          launches = 1;
        }
        report({ kind: "syncing", server, percent });
      }
      await deps.sleep(POLL_MS);
    }
  } finally {
    // However it ended, the engine is stopped and what it scanned is written
    // before the next wallet replaces this one in the native module. Neither
    // step changes the outcome already reached, so a failure here is logged
    // and no more.
    try {
      await deps.stop();
      await deps.save();
    } catch (error) {
      console.error(`sync all: could not stop and save wallet ${wallet.id}: ${error}`);
    }
  }
}

/**
 * Runs the whole sequence. `onProgress` is told each wallet's state as it
 * changes; `cancelled` is asked between steps, and once it answers true the
 * wallet in hand is stopped and saved and no other is opened.
 */
export async function runSyncAll(
  wallets: readonly WalletType[],
  deps: SyncAllDeps,
  onProgress: (walletId: number, progress: WalletProgress) => void,
  cancelled: () => boolean,
): Promise<void> {
  for (const wallet of wallets) {
    if (cancelled()) {
      onProgress(wallet.id, { kind: "cancelled" });
      continue;
    }
    let outcome: WalletProgress;
    try {
      outcome = await syncOne(wallet, deps, (progress) => onProgress(wallet.id, progress), cancelled);
    } catch (error) {
      outcome = { kind: "failed", reason: userFacingError(error) };
    }
    onProgress(wallet.id, outcome);
  }
}

export default runSyncAll;
