import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import cstyles from "../common/Common.module.css";
import styles from "./SyncAllWallets.module.css";
import { ContextApp } from "../../context/ContextAppState";
import { ipcRenderer } from "../../electronBridge";
import { WalletType } from "../appstate";
import Utils from "../../utils/utils";
import { SyncAllDeps, WalletProgress, nativeSyncAllDeps, runSyncAll, syncAllOrder } from "../../syncAll";

type SyncAllWalletsProps = {
  /** Stops the open wallet's task cycle. The run takes the native module over. */
  clearTimers: () => Promise<void>;
  /** The user backed out before anything started. Nothing was touched. */
  onBack: () => void;
  /** The run is over. The wallet that was open has to be opened again. */
  onExit: () => void;
  makeDeps?: () => SyncAllDeps;
};

type Phase = "warning" | "running" | "done";

const PENDING: WalletProgress = { kind: "pending" };

function stateText(progress: WalletProgress): string {
  switch (progress.kind) {
    case "pending":
      return "Waiting";
    case "syncing":
      return progress.percent === null ? "Opening..." : `Syncing ${progress.percent.toFixed(2)}%`;
    case "synced":
      return "Synced";
    case "failed":
      return progress.reason;
    case "skipped":
      return "Skipped";
    case "cancelled":
      return "Not synced";
  }
}

function stateColour(progress: WalletProgress): string | undefined {
  if (progress.kind === "failed") return "var(--color-error)";
  if (progress.kind === "synced") return "var(--color-primary)";
  return undefined;
}

/**
 * Syncs every wallet the app holds, one after another, on a screen of its own.
 *
 * The native module holds one wallet at a time, so while this runs the wallet
 * the user had open is not there: no balance, no send, no receive. That is why
 * it is a screen with no sidebar and no wallet bar rather than a modal over
 * the app, and why it says so before it starts.
 */
const SyncAllWallets: React.FC<SyncAllWalletsProps> = ({
  clearTimers,
  onBack,
  onExit,
  makeDeps = nativeSyncAllDeps,
}) => {
  const { wallets } = useContext(ContextApp);
  const ordered: WalletType[] = useMemo(() => syncAllOrder(wallets), [wallets]);

  const [phase, setPhase] = useState<Phase>("warning");
  const [progress, setProgress] = useState<Record<number, WalletProgress>>({});
  const [cancelling, setCancelling] = useState<boolean>(false);
  const [skipping, setSkipping] = useState<boolean>(false);
  const cancelRef = useRef<boolean>(false);
  const skipRef = useRef<boolean>(false);
  const mountedRef = useRef<boolean>(true);

  // Leaving the screen by any road ends the run: the loop reads this between
  // steps, stops the wallet in hand and opens no other.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelRef.current = true;
    };
  }, []);

  const start = useCallback(async () => {
    setPhase("running");
    const deps = makeDeps();
    await clearTimers();
    // The open wallet's engine is stopped and its file written before the
    // first wallet of the run replaces it. A wallet that never opened has
    // neither, and says so by throwing.
    try {
      await deps.stop();
      await deps.save();
    } catch (error) {
      console.log(`sync all: no open wallet to stop and save ${error}`);
    }
    await ipcRenderer.invoke("power:keep-awake", true);
    try {
      await runSyncAll(
        ordered,
        deps,
        (walletId: number, state: WalletProgress) => {
          if (!mountedRef.current) return;
          setProgress((previous) => ({ ...previous, [walletId]: state }));
          // The wallet in hand has ended, by a skip or otherwise; the next one
          // starts with the button offered again.
          if (state.kind !== "syncing") setSkipping(false);
        },
        {
          cancelled: () => cancelRef.current,
          takeSkip: () => {
            const asked = skipRef.current;
            skipRef.current = false;
            return asked;
          },
        },
      );
    } finally {
      await ipcRenderer.invoke("power:keep-awake", false);
    }
    if (!mountedRef.current) return;
    // A cancelled run goes straight back to the wallet that was open: the
    // user asked to stop, not to read a report.
    if (cancelRef.current) {
      onExit();
    } else {
      setPhase("done");
    }
  }, [ordered, makeDeps, clearTimers, onExit]);

  const cancel = () => {
    cancelRef.current = true;
    setCancelling(true);
  };

  const skip = () => {
    skipRef.current = true;
    setSkipping(true);
  };

  const synced: number = ordered.filter((w) => progress[w.id]?.kind === "synced").length;

  return (
    <div className={`${cstyles.verticalflex} ${cstyles.center} ${styles.container}`}>
      <div className={cstyles.xlarge}>Sync all wallets</div>

      {phase === "warning" && (
        <div className={styles.notice}>
          <p>
            Every wallet below is opened and synced to the chain tip, one after another, in this order. While this runs
            the app does nothing else: you cannot send, receive or change wallet until it finishes or you cancel it.
          </p>
          <p>
            A wallet that is far behind can take a long time. The computer is kept awake meanwhile. You can cancel at
            any moment: what has been scanned is kept, and the app goes back to the wallet you have open now.
          </p>
        </div>
      )}

      {phase === "done" && (
        <div className={styles.notice} data-testid="sync-all-summary">
          {synced} of {ordered.length} wallets synced.
        </div>
      )}

      <div className={styles.wallets}>
        {ordered.map((wallet: WalletType) => {
          const state: WalletProgress = progress[wallet.id] ?? PENDING;
          return (
            <div key={wallet.id} className={styles.wallet} data-testid={`sync-all-wallet-${wallet.id}`}>
              <div>
                <div>{wallet.alias}</div>
                <div className={`${cstyles.sublight} ${cstyles.small}`}>
                  {Utils.chainDisplayName(wallet.chain_name)}
                  {state.kind === "syncing" && ` - ${state.server}`}
                </div>
              </div>
              {phase !== "warning" && (
                <div className={styles.state} style={{ color: stateColour(state) }}>
                  {stateText(state)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className={`${cstyles.horizontalflex} ${cstyles.margintoplarge}`} style={{ justifyContent: "center" }}>
        {phase === "warning" && (
          <>
            <button type="button" className={cstyles.primarybutton} disabled={ordered.length === 0} onClick={start}>
              Sync all wallets
            </button>
            <button type="button" className={cstyles.primarybutton} onClick={onBack}>
              Cancel
            </button>
          </>
        )}
        {phase === "running" && (
          <>
            {/* For the wallet that is taking too long: the run goes on to the
                next instead of holding at the same place every time it is
                started. */}
            <button type="button" className={cstyles.primarybutton} disabled={cancelling || skipping} onClick={skip}>
              {skipping ? "Skipping..." : "Skip this wallet"}
            </button>
            <button type="button" className={cstyles.primarybutton} disabled={cancelling} onClick={cancel}>
              {cancelling ? "Cancelling..." : "Cancel"}
            </button>
          </>
        )}
        {phase === "done" && (
          <button type="button" className={cstyles.primarybutton} onClick={onExit}>
            Back to my wallet
          </button>
        )}
      </div>
    </div>
  );
};

export default SyncAllWallets;
