import React, { useContext } from "react";
import { useNavigate } from "react-router-dom";
import cstyles from "../common/Common.module.css";
import styles from "./Dashboard.module.css";
import routes from "../../constants/routes.json";
import { SyncAllContext, WalletProgress } from "../../syncAll";

/**
 * Where a run of "sync all wallets" has got to, on the screen the user comes
 * back to.
 *
 * The run goes on in the background, so the place it is started from is not
 * the place the user is while it works. This says it is still going, and
 * leads to the screen with every wallet's state. It wears the private
 * migration's banner because it is the same kind of thing: work in progress
 * the app is doing by itself, with a screen of its own behind "Details".
 */
const SyncAllBanner: React.FC = () => {
  const navigate = useNavigate();
  const run = useContext(SyncAllContext);

  if (run.phase === "idle") return null;

  const total: number = run.wallets.length;
  const details = (
    <button type="button" className={styles.detailslink} onClick={() => navigate(routes.SYNCALL)}>
      Details
    </button>
  );

  if (run.phase === "done") {
    const synced: number = run.wallets.filter((w) => run.progress[w.id]?.kind === "synced").length;
    return (
      <div className={`${cstyles.well} ${styles.migrationprogress}`} data-testid="sync-all-banner">
        <div className={styles.migrationtop}>
          <span className={cstyles.highlight}>Sync all wallets finished</span>
          {details}
        </div>
        <div className={styles.migrationprogressbody}>
          <span className={cstyles.sublight}>
            {synced} of {total} wallets synced.
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
          <button type="button" className={cstyles.primarybutton} onClick={run.dismiss}>
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
    <div className={`${cstyles.well} ${styles.migrationprogress}`} data-testid="sync-all-banner">
      <div className={styles.migrationtop}>
        <span className={cstyles.highlight}>Syncing all wallets</span>
        {details}
      </div>
      <div className={styles.migrationprogressbody}>
        <div
          className={styles.migrationring}
          style={{
            background: `conic-gradient(var(--color-primary) ${percent * 3.6}deg, var(--color-background-dark) 0deg)`,
          }}
        >
          <span className={styles.migrationringinner}>{percent}%</span>
        </div>
        <div className={styles.migrationinfo}>
          <span className={cstyles.sublight}>
            {done} of {total} wallets done
          </span>
          {inHand && state?.kind === "syncing" && (
            <span className={cstyles.yellow}>
              {inHand.alias}: {state.percent === null ? "opening..." : `${state.percent.toFixed(2)}%`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default SyncAllBanner;
