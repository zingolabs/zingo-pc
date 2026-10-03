import React, { useContext, useMemo } from "react";
import cstyles from "../common/Common.module.css";
import styles from "./SyncAllWallets.module.css";
import { ContextApp } from "../../context/ContextAppState";
import { WalletType } from "../appstate";
import ScrollPaneTop from "../scrollPane/ScrollPane";
import { usePaneOffset } from "../scrollPane/usePaneOffset";
import Utils from "../../utils/utils";
import { SyncAllContext, WalletProgress, syncAllOrder } from "../../syncAll";

type SyncAllWalletsProps = {
  /** Leaves the screen. A run in progress goes on without it. */
  onClose: () => void;
};

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
    case "open":
      return "Open in the app";
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
 * Starts a run of "sync all wallets", and shows one in detail.
 *
 * The run itself lives above the screens (`useSyncAllRun`): it goes on in the
 * background while the user uses the app, and this is only where they look at
 * it. Leaving the screen changes nothing about the run.
 */
const SyncAllWallets: React.FC<SyncAllWalletsProps> = ({ onClose }) => {
  const { wallets } = useContext(ContextApp);
  const run = useContext(SyncAllContext);
  const { paneRef, footerRef, paneOffset } = usePaneOffset(260);

  // Before a run, the wallets as they would be taken. During and after one,
  // the wallets it was started with.
  const ordered: readonly WalletType[] = useMemo(
    () => (run.phase === "idle" ? syncAllOrder(wallets) : run.wallets),
    [run.phase, run.wallets, wallets],
  );

  const synced: number = ordered.filter((w) => run.progress[w.id]?.kind === "synced").length;

  // What goes where. Before the run, the wallets in the order they will be
  // taken. During and after it, the wallet in hand on its own above the list,
  // and below it the ones that have ended, latest first, then the rest in
  // their order: with many wallets, what changes is at the top rather than
  // under the scroll.
  const inHand: WalletType | undefined =
    run.phase === "idle" ? undefined : ordered.find((w) => run.progress[w.id]?.kind === "syncing");
  const listed: readonly WalletType[] =
    run.phase === "idle"
      ? ordered
      : [
          ...[...run.endedIds].reverse().flatMap((id) => ordered.filter((w) => w.id === id)),
          ...ordered.filter((w) => w !== inHand && !run.endedIds.includes(w.id)),
        ];

  const row = (wallet: WalletType) => {
    const state: WalletProgress = run.progress[wallet.id] ?? PENDING;
    return (
      <div key={wallet.id} className={styles.wallet} data-testid={`sync-all-wallet-${wallet.id}`}>
        <div>
          <div>{wallet.alias}</div>
          <div className={`${cstyles.sublight} ${cstyles.small}`}>
            {Utils.chainDisplayName(wallet.chain_name)}
            {state.kind === "syncing" && !!state.server && ` - ${state.server}`}
          </div>
        </div>
        {run.phase !== "idle" && (
          <div className={styles.state} style={{ color: stateColour(state) }}>
            {stateText(state)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`${cstyles.center} ${styles.container}`}>
      <div className={cstyles.xlarge}>Sync all wallets</div>

      {run.phase === "idle" && (
        <div className={styles.notice}>
          <p>
            Every wallet below is synced to the chain tip, one after another, in this order. It happens in the
            background: you can keep using the app, and come back here to see how it is going.
          </p>
          <p>
            The wallet you have open is left to its own sync. Sending and shielding take longer while this runs, and the
            computer is kept awake until it finishes. You can cancel at any moment: what has been scanned is kept.
          </p>
        </div>
      )}

      {run.phase === "done" && (
        <div className={styles.notice} data-testid="sync-all-summary">
          {synced} of {ordered.length} wallets synced.
        </div>
      )}

      {inHand && (
        <div className={styles.inhand} data-testid="sync-all-in-hand">
          {row(inHand)}
        </div>
      )}

      <div ref={paneRef} className={styles.pane}>
        <ScrollPaneTop offsetHeight={paneOffset}>
          <div className={`${styles.wallets} ${inHand ? styles.walletsbelow : ""}`}>{listed.map(row)}</div>
        </ScrollPaneTop>
      </div>

      <div
        ref={footerRef}
        className={`${cstyles.horizontalflex} ${styles.buttons}`}
        style={{ justifyContent: "center" }}
      >
        {run.phase === "idle" && (
          <>
            <button
              type="button"
              className={cstyles.primarybutton}
              disabled={ordered.length === 0}
              onClick={() => run.start(ordered)}
            >
              Sync all wallets
            </button>
            <button type="button" className={cstyles.primarybutton} onClick={onClose}>
              Cancel
            </button>
          </>
        )}
        {run.phase === "running" && (
          <>
            {/* For the wallet that is taking too long: the run goes on to the
                next instead of holding at the same place every time it is
                started. */}
            <button
              type="button"
              className={cstyles.primarybutton}
              disabled={run.cancelling || run.skipping || !inHand}
              onClick={run.skip}
            >
              {run.skipping ? "Skipping..." : "Skip this wallet"}
            </button>
            <button type="button" className={cstyles.primarybutton} disabled={run.cancelling} onClick={run.cancel}>
              {run.cancelling ? "Cancelling..." : "Cancel"}
            </button>
          </>
        )}
        {run.phase === "done" && (
          <button
            type="button"
            className={cstyles.primarybutton}
            onClick={() => {
              run.dismiss();
              onClose();
            }}
          >
            Close
          </button>
        )}
      </div>
    </div>
  );
};

export default SyncAllWallets;
