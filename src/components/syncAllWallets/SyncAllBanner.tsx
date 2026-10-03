import React, { useContext } from "react";
import { useNavigate } from "react-router-dom";
import cstyles from "../common/Common.module.css";
import styles from "./SyncAllBanner.module.css";
import routes from "../../constants/routes.json";
import { SyncAllContext, WalletProgress } from "../../syncAll";

/**
 * Where a run of "sync all wallets" has got to, on every screen.
 *
 * The run goes on in the background, so the user is somewhere else while it
 * works. This says it is still going, wherever they are, and leads to the
 * screen with every wallet's state.
 */
const SyncAllBanner: React.FC = () => {
  const navigate = useNavigate();
  const run = useContext(SyncAllContext);

  if (run.phase === "idle") return null;

  const total: number = run.wallets.length;
  const details = (
    <button type="button" className={styles.link} onClick={() => navigate(routes.SYNCALL)}>
      Details
    </button>
  );

  if (run.phase === "done") {
    const synced: number = run.wallets.filter((w) => run.progress[w.id]?.kind === "synced").length;
    return (
      <div className={styles.banner} data-testid="sync-all-banner">
        <div className={styles.side}>
          <span className={cstyles.highlight}>Sync all wallets finished</span>
          <span className={cstyles.sublight}>
            {synced} of {total} wallets synced
          </span>
        </div>
        <div className={styles.side}>
          {details}
          <button type="button" className={styles.link} onClick={run.dismiss}>
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  const done: number = run.endedIds.length;
  const percent: number = total > 0 ? Math.round((done / total) * 100) : 0;
  const inHand = run.wallets.find((w) => run.progress[w.id]?.kind === "syncing");
  const state: WalletProgress | undefined = inHand ? run.progress[inHand.id] : undefined;

  return (
    <div className={styles.banner} data-testid="sync-all-banner">
      <div className={styles.side}>
        <span className={cstyles.highlight}>Syncing all wallets</span>
        <span className={cstyles.sublight}>
          {done} of {total} done
        </span>
      </div>
      <div className={styles.side}>
        {inHand && state?.kind === "syncing" && (
          <span className={styles.inhand}>
            {inHand.alias}:{" "}
            <span className={cstyles.yellow}>
              {state.percent === null ? "opening..." : `${state.percent.toFixed(2)}%`}
            </span>
          </span>
        )}
        {details}
      </div>
      <div className={styles.progress} style={{ width: `${percent}%` }} />
    </div>
  );
};

export default SyncAllBanner;
