import React, { useEffect, useState } from "react";
import cstyles from "../common/Common.module.css";
import styles from "./PrivateMigration.module.css";
import Utils from "../../utils/utils";
import RPC from "../../rpc/rpc";
import { FfiMigrationSummary, FfiPlan } from "./privateMigrationTypes";

// Private migration — real data, no mocks. Uses the one-call migrate_to_ironwood:
// it splits the wallet's Orchard notes into standard denominations (in rounds,
// each waiting to confirm) and then sends every part to Ironwood at once. This
// is the only public path that drives note-splitting to completion in this
// zingolib build; the scheduled start/broadcast_due_parts flow has no public
// split driver yet, so we run the complete migration here.
//
// It is therefore immediate (not windowed): the transfers happen together and
// alongside the wallet's sync, which the review screen discloses.
type Step = "plan" | "executing" | "result";

type PrivateMigrationProps = {
  currencyName: string;
  // Provided by Routes: stops the sync loop, runs migrate_to_ironwood, resumes.
  migrateToIronwood: () => Promise<{ result: FfiMigrationSummary | null; error: string }>;
  // Dry-run: the plan is computed and shown, but nothing can be sent because
  // Ironwood is not active yet (used from the pre-activation banner).
  simulation: boolean;
  activationHeight: number;
  walletHeight: number;
  onBack: () => void;
  onExit: () => void;
};

const zatsToZec = (z: number): number => z / 100_000_000;
const fmt = (zec: number): string => Utils.maxPrecisionTrimmed(zec);

const PrivateMigration: React.FC<PrivateMigrationProps> = ({
  currencyName,
  migrateToIronwood,
  simulation,
  activationHeight,
  walletHeight,
  onBack,
  onExit,
}) => {
  const [step, setStep] = useState<Step>("plan");
  const [plan, setPlan] = useState<FfiPlan | null>(null);
  const [loadingPlan, setLoadingPlan] = useState<boolean>(true);
  const [result, setResult] = useState<FfiMigrationSummary | null>(null);
  const [error, setError] = useState<string>("");

  // Load the real plan once (read-only; nothing is signed or sent).
  useEffect(() => {
    let active = true;
    (async () => {
      const p = await RPC.planIronwoodMigration();
      if (!active) return;
      setPlan(p);
      setLoadingPlan(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const run = async () => {
    setStep("executing");
    setError("");
    setResult(null);
    const { result: summary, error: migErr } = await migrateToIronwood();
    if (migErr || !summary) {
      setError(migErr || "No result returned.");
    } else {
      setResult(summary);
    }
    setStep("result");
  };

  const totalFee = plan ? zatsToZec(plan.split_fee + plan.parts_fee) : 0;
  const splitTxCount = plan ? plan.split_rounds.reduce((n, round) => n + round.length, 0) : 0;
  const blocksToGo = Math.max(activationHeight - walletHeight, 0);

  return (
    <div className={styles.container}>
      {/* ---------- Review the real plan ---------- */}
      {step === "plan" && (
        <>
          <div className={cstyles.large}>Private migration</div>

          {loadingPlan ? (
            <>
              <div className={cstyles.sublight} style={{ marginTop: 6 }}>
                Reading your Orchard notes…
              </div>
              <div className={styles.spinner} />
            </>
          ) : !plan || plan.parts.length === 0 ? (
            <>
              <div className={`${cstyles.well} ${styles.card}`}>
                <div className={cstyles.sublight}>
                  There is nothing to migrate privately right now — no spendable Orchard above the dust threshold.
                </div>
              </div>
              <div className={styles.buttons}>
                <button type="button" className={cstyles.primarybutton} onClick={onBack}>
                  Back
                </button>
              </div>
            </>
          ) : (
            <>
              <div className={cstyles.sublight} style={{ marginTop: 6 }}>
                Your Orchard notes are standardized into common denominations and then moved to Ironwood.
              </div>

              <div className={`${cstyles.well} ${styles.card}`}>
                <div className={styles.row}>
                  <span className={cstyles.sublight}>Parts to send</span>
                  <span className={styles.mono}>{plan.parts.length}</span>
                </div>
                <div className={styles.row}>
                  <span className={cstyles.sublight}>Denominations</span>
                  <span className={styles.mono}>{plan.parts.map((p) => fmt(zatsToZec(p))).join(", ")}</span>
                </div>
                {splitTxCount > 0 && (
                  <div className={styles.row}>
                    <span className={cstyles.sublight}>Note-splitting txs</span>
                    <span className={styles.mono}>{splitTxCount}</span>
                  </div>
                )}
                <div className={styles.row}>
                  <span className={cstyles.sublight}>Estimated fees</span>
                  <span className={styles.mono}>
                    {fmt(totalFee)} {currencyName}
                  </span>
                </div>
                {plan.stranded > 0 && (
                  <div className={styles.row}>
                    <span className={cstyles.sublight}>Left as dust</span>
                    <span className={styles.mono}>
                      {fmt(zatsToZec(plan.stranded))} {currencyName}
                    </span>
                  </div>
                )}
              </div>

              <div className={styles.infonote}>
                {splitTxCount > 0 ? (
                  <>
                    Splitting runs in {plan.split_rounds.length} round{plan.split_rounds.length === 1 ? "" : "s"}, each
                    waiting to confirm, then the parts are sent — all while the app is open. The transfers are
                    correlated in time; keep the app open until it finishes.
                  </>
                ) : (
                  <>The parts are sent together while the app is open. Keep it open until it finishes.</>
                )}
              </div>

              {error && (
                <div className={cstyles.red} style={{ marginTop: 10 }}>
                  {error}
                </div>
              )}

              {simulation ? (
                <>
                  <div className={styles.infonote}>
                    <b>Simulation.</b> Ironwood (NU6.3) activates at block {activationHeight.toLocaleString()} —{" "}
                    {blocksToGo.toLocaleString()} blocks to go. The migration window isn&apos;t open yet, so nothing can
                    be sent — but this is exactly how your funds will be migrated when it opens.
                  </div>
                  <div className={styles.buttons}>
                    <button type="button" className={cstyles.primarybutton} onClick={onExit}>
                      Back to wallet
                    </button>
                  </div>
                </>
              ) : (
                <div className={styles.buttons}>
                  <button type="button" className={cstyles.primarybutton} onClick={onBack}>
                    Back
                  </button>
                  <button type="button" className={cstyles.primarybutton} onClick={run}>
                    Start migration
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ---------- Running (long: split rounds + part broadcast) ---------- */}
      {step === "executing" && (
        <div className={cstyles.center}>
          <div className={cstyles.large}>Migrating…</div>
          <div className={cstyles.sublight} style={{ marginTop: 12 }}>
            Splitting your notes and moving them to Ironwood.
            <br />
            This runs in several rounds and can take a few minutes — please keep the app open.
          </div>
          <div className={styles.spinner} />
        </div>
      )}

      {/* ---------- Result ---------- */}
      {step === "result" && (
        <>
          {error || !result ? (
            <>
              <div className={`${cstyles.large} ${cstyles.red}`}>Migration failed</div>
              <div className={`${cstyles.well} ${styles.card}`}>
                <div className={cstyles.sublight}>{error || "No result returned."}</div>
              </div>
            </>
          ) : (
            <>
              <div className={`${cstyles.large} ${cstyles.green}`}>Migration complete</div>
              <div className={`${cstyles.well} ${styles.card}`}>
                <div className={styles.row}>
                  <span className={cstyles.sublight}>Note-splitting transactions</span>
                  <span className={styles.mono}>{result.split_txids.length}</span>
                </div>
                <div className={styles.row}>
                  <span className={cstyles.sublight}>Parts sent to Ironwood</span>
                  <span className={styles.mono}>{result.part_txids.length}</span>
                </div>
                {result.stranded > 0 && (
                  <div className={styles.row}>
                    <span className={cstyles.sublight}>Left in Orchard (dust)</span>
                    <span className={styles.mono}>
                      {fmt(zatsToZec(result.stranded))} {currencyName}
                    </span>
                  </div>
                )}
              </div>
            </>
          )}
          <div className={styles.buttons}>
            <button type="button" className={cstyles.primarybutton} onClick={onExit}>
              Back to wallet
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default PrivateMigration;
