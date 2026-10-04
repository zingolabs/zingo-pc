import React, { useContext, useEffect, useRef } from "react";
import cstyles from "../common/Common.module.css";
import styles from "./SyncAllWallets.module.css";
import { ContextApp } from "../../context/ContextAppState";
import { WalletType } from "../appstate";
import ScrollPaneTop from "../scrollPane/ScrollPane";
import { usePaneOffset } from "../scrollPane/usePaneOffset";
import Utils from "../../utils/utils";
import { SyncAllContext, WalletProgress } from "../../syncAll";

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

/**
 * What a press is about to do, for the confirmation in front of it. Broken at
 * words: the dialog breaks anywhere, which is for addresses and not sentences.
 */
const Consequence: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ wordBreak: "normal", lineHeight: 1.5 }}>{children}</div>
);

function stateColour(progress: WalletProgress): string | undefined {
  if (progress.kind === "failed") return "var(--color-error)";
  if (progress.kind === "synced") return "var(--color-primary)";
  return undefined;
}

/**
 * A run of "sync all wallets", in detail.
 *
 * The run itself lives above the screens (`useSyncAllRun`): it is started
 * from the Wallet menu, goes on in the background while the user uses the
 * app, and this is only where they look at it, by way of the banner under
 * the wallet bar. Leaving the screen changes nothing about the run.
 */
const SyncAllWallets: React.FC<SyncAllWalletsProps> = ({ onClose }) => {
  const { openConfirmModal } = useContext(ContextApp);
  const run = useContext(SyncAllContext);
  // The run as it is when a confirmation is answered, which is later than
  // when it was asked.
  const runRef = useRef(run);
  runRef.current = run;
  const { paneRef, footerRef, paneOffset } = usePaneOffset(200);

  // With no run there is nothing to show: one that was put away, or a screen
  // reached with none started.
  const idle: boolean = run.phase === "idle";
  useEffect(() => {
    if (idle) onClose();
  }, [idle, onClose]);

  const ordered: readonly WalletType[] = run.wallets;
  const synced: number = ordered.filter((w) => run.progress[w.id]?.kind === "synced").length;

  // The wallet in hand on its own above the list, and below it the ones that
  // have ended, latest first, then the rest in their order: with many
  // wallets, what changes is at the top rather than under the scroll.
  const inHand: WalletType | undefined = ordered.find((w) => run.progress[w.id]?.kind === "syncing");
  const listed: readonly WalletType[] = [
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
        <div className={styles.state} style={{ color: stateColour(state) }}>
          {stateText(state)}
        </div>
      </div>
    );
  };

  // Cancelling gives up every wallet still waiting, so it says what it will do
  // and waits for a yes. Skipping gives up one and the run goes on, which the
  // row says as it happens.
  const askToCancel = () => {
    openConfirmModal(
      "Cancel Syncing",
      <Consequence>
        The wallet being synced is stopped, and what it has scanned is kept. The wallets still waiting are not synced.
      </Consequence>,
      () => runRef.current.cancel(),
    );
  };

  if (idle) return null;

  return (
    <div className={`${cstyles.center} ${styles.container}`}>
      <div className={cstyles.xlarge}>Sync all wallets</div>

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
            {/* Named for what it cancels. A bare "Cancel" under a list reads
                as a way out of the screen. */}
            <button type="button" className={cstyles.primarybutton} disabled={run.cancelling} onClick={askToCancel}>
              {run.cancelling ? "Cancelling..." : "Cancel Syncing"}
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
