import React, { useContext, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import RPC from "../../rpc/rpc";
import cstyles from "../common/Common.module.css";
import styles from "./OrchardMigration.module.css";
import { ContextApp } from "../../context/ContextAppState";
import routes from "../../constants/routes.json";
import Utils from "../../utils/utils";
import { RPCIronwoodDrainType } from "../../rpc/components/RPCIronwoodDrainType";
import { ironwoodReady } from "../../constants/ironwood";
import PrivateMigration from "./PrivateMigration";

// intro → howItWorks → strategy → (private flow | quick: confirm→executing→result)
type Step = "intro" | "howItWorks" | "strategy" | "confirm" | "executing" | "result" | "private";
type Strategy = "private" | "now";

// Provided by Routes (runRPCDrainToIronwood): stops the sync loop, drains, and
// resumes — the drain syncs internally, so it cannot run while a sync is active.
// The private path drives the scheduled split flow itself (via RPC statics), so
// it needs no callback here.
type OrchardMigrationProps = {
  drainToIronwood: () => Promise<{ result: RPCIronwoodDrainType | null; error: string }>;
};

// The drain result reports zatoshis; the rest of the UI works in ZEC.
const zatsToZec = (zats: number): string => Utils.maxPrecisionTrimmed(zats / 100_000_000);

const OrchardMigration: React.FC<OrchardMigrationProps> = ({ drainToIronwood }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { totalBalance, readOnly, info } = useContext(ContextApp);

  // Simulation (dry-run) is entered from the pre-activation banner: the plan can
  // be computed but nothing can be sent until Ironwood is active.
  // Resume is entered from the "Migration in Progress" banner's Details link: it
  // must land straight on the private-path status (which migration is already
  // underway), NOT the intro/strategy sequence that would offer starting a
  // different migration.
  let simulation = false;
  let resume = false;
  if (location.state) {
    simulation = (location.state as { simulation?: boolean }).simulation ?? false;
    resume = (location.state as { resume?: boolean }).resume ?? false;
  }
  // A migration already in progress can only be resumed, never restarted, so
  // jump to the private flow whether the flag or the live status says so.
  const resumeInProgress: boolean = resume || info.migrationInProgress;

  // Ironwood only exists once the wallet has synced to the NU6.3 activation block.
  const ready: boolean = ironwoodReady(info.nu63ActivationHeight, info.walletHeight);

  const [step, setStep] = useState<Step>(resumeInProgress ? "private" : "intro");
  // Both strategies are offered: the quick happy path and the private
  // (scheduled) path, which drives zingolib's split scheduling and routes over
  // the Nym mixnet. Resume lands an already-underway private migration on its
  // status screen (so it can finish/dismiss).
  const [strategy, setStrategy] = useState<Strategy>("now");
  const [result, setResult] = useState<RPCIronwoodDrainType | null>(null);
  const [error, setError] = useState<string>("");
  // Live drain progress (built/sent of total), polled while executing.
  const [drainProgress, setDrainProgress] = useState<{
    total: number;
    built: number;
    sent: number;
    phase: string;
  } | null>(null);
  // A drain runs in the native even after this screen unmounts. When the user
  // re-enters mid-drain we RESUME the executing view (rather than offering a fresh
  // start that would queue a second drain). Its final result was returned to the
  // now-gone promise, so on resume we can only show a generic completion.
  const [resumedDrain, setResumedDrain] = useState<boolean>(false);
  const [resumedComplete, setResumedComplete] = useState<boolean>(false);

  // On entry, if a drain is already running in the native (started from a prior
  // visit the user navigated away from), resume the executing view instead of
  // the intro — so we neither hide the in-flight migration nor let a second one
  // be queued behind it. Only when not already resuming a scheduled migration.
  useEffect(() => {
    if (resumeInProgress) return;
    let active = true;
    (async () => {
      const s = await RPC.drainStatus();
      if (active && s) {
        setResumedDrain(true);
        setStep("executing");
      }
    })();
    return () => {
      active = false;
    };
  }, [resumeInProgress]);

  // Poll the drain's lock-free progress side channel while it runs. The drain
  // holds the wallet lock across its whole run, so this side channel — not the
  // wallet state — is what surfaces "built i/N, sent i/N".
  useEffect(() => {
    if (step !== "executing") return;
    let active = true;
    const id = setInterval(async () => {
      const s = await RPC.drainStatus();
      if (!active) return;
      setDrainProgress(s);
      // A resumed drain has no local promise to land its result: once its status
      // goes idle it has finished, so show a generic done — the balance/history
      // carry the real outcome. (resumedDrain is only set after mount confirmed a
      // drain was running, so idle here means completed, not never-started.)
      if (!s && resumedDrain) {
        setResumedComplete(true);
        setStep("result");
      }
    }, 1000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [step, resumedDrain]);

  // Confirmed (spendable) balance — that is what the drain can actually move,
  // and it matches the Dashboard banner's gate.
  const orchardBalance: number = totalBalance ? totalBalance.confirmedOrchardBalance : 0;

  // Whether the quick migration can actually run now (else the confirm screen
  // shows a neutral note + "Back to wallet", like the private path's simulation).
  const canRun: boolean = ready && !readOnly && orchardBalance > 0;
  const blocksToGo: number = Math.max(info.nu63ActivationHeight - info.walletHeight, 0);

  const backToWallet = () => navigate(routes.DASHBOARD, { replace: true, state: {} });

  // Happy path: one-shot drain of the whole Orchard balance into Ironwood.
  const runQuickMigration = async () => {
    setStep("executing");
    setError("");
    setResult(null);
    setDrainProgress(null);
    const { result: drain, error: drainError } = await drainToIronwood();
    if (drainError || !drain) {
      setError(drainError || "No result returned.");
    } else {
      setResult(drain);
    }
    setStep("result");
  };

  return (
    <div className={styles.container}>
      {step === "intro" && (
        <div className={cstyles.verticalflex}>
          <div className={`${cstyles.xlarge} ${cstyles.center}`}>Meet Ironwood</div>
          <div className={`${cstyles.well} ${styles.card}`}>
            <p>
              NU6.3 introduces the new <b>Ironwood</b> pool and freezes the Orchard pool. Soon you will no longer be
              able to move funds within Orchard.
            </p>
            <p>Move your funds to Ironwood now to keep transacting and to get quantum-recoverable notes.</p>
          </div>
          <div className={styles.buttons}>
            <button type="button" className={cstyles.primarybutton} onClick={backToWallet}>
              Not now
            </button>
            <button type="button" className={cstyles.primarybutton} onClick={() => setStep("howItWorks")}>
              Next
            </button>
          </div>
        </div>
      )}

      {step === "howItWorks" && (
        <div className={cstyles.verticalflex}>
          <div className={`${cstyles.xlarge} ${cstyles.center}`}>How the move works</div>

          <div className={`${cstyles.well} ${styles.card}`}>
            <div className={cstyles.highlight}>Phase 1 — Split</div>
            <div className={styles.phaseboxes}>
              <span className={styles.phasebox} />
              <span className={styles.phasearrow}>→</span>
              <span className={styles.miniboxes}>
                <span className={styles.minibox} />
                <span className={styles.minibox} />
                <span className={styles.minibox} />
              </span>
            </div>
            <div className={cstyles.sublight}>
              A quick internal transaction standardizes your balances to protect your privacy.
            </div>
          </div>

          <div className={`${cstyles.well} ${styles.card}`}>
            <div className={cstyles.highlight}>Phase 2 — Send in batches</div>
            <div className={styles.phaseboxes}>
              <span className={styles.bucket}>Bucket 1</span>
              <span className={styles.bucket}>Bucket 2</span>
              <span className={styles.bucket}>Bucket 3</span>
            </div>
            <div className={cstyles.sublight}>
              Shipments are sent in time windows. We don&apos;t operate in the background: we&apos;ll notify you to open
              the app and authorize each batch.
            </div>
          </div>

          <div className={styles.buttons}>
            <button type="button" className={cstyles.primarybutton} onClick={() => setStep("intro")}>
              Back
            </button>
            <button type="button" className={cstyles.primarybutton} onClick={() => setStep("strategy")}>
              Next
            </button>
          </div>
        </div>
      )}

      {step === "strategy" && (
        <div className={cstyles.verticalflex}>
          <div className={`${cstyles.xlarge} ${cstyles.center}`}>Migration Strategy</div>
          <div className={`${cstyles.sublight} ${cstyles.center}`} style={{ marginTop: 6 }}>
            Your Orchard funds must migrate to the new Ironwood pool. Since this is a cross-pool transfer, choose how
            the migration is made.
          </div>

          <div
            role="button"
            tabIndex={0}
            className={`${cstyles.well} ${styles.card} ${styles.choicecard} ${
              strategy === "now" ? styles.choiceselected : ""
            }`}
            onClick={() => setStrategy("now")}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setStrategy("now")}
          >
            <div className={cstyles.highlight}>Migrate now</div>
            <div className={cstyles.sublight}>
              Done in minutes, in one round — a single transaction for most wallets, a few if you hold many Orchard
              notes (over 32). Your full balance amount of {info.currencyName}{" "}
              {Utils.maxPrecisionTrimmed(orchardBalance)} becomes publicly visible on-chain.
            </div>
          </div>

          <div
            role="button"
            tabIndex={0}
            className={`${cstyles.well} ${styles.card} ${styles.choicecard} ${
              strategy === "private" ? styles.choiceselected : ""
            }`}
            onClick={() => setStrategy("private")}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setStrategy("private")}
          >
            <div className={cstyles.highlight}>Migrate privately</div>
            <div className={cstyles.sublight}>
              Spreads transfers over ~3 days in standard amounts, blending with other users, and routes them over the
              Nym mixnet so your IP stays private.
            </div>
          </div>

          <div className={styles.buttons}>
            <button type="button" className={cstyles.primarybutton} onClick={() => setStep("howItWorks")}>
              Back
            </button>
            <button
              type="button"
              className={cstyles.primarybutton}
              onClick={() => setStep(strategy === "private" ? "private" : "confirm")}
            >
              {simulation ? "Simulate" : "Review"}
            </button>
          </div>
        </div>
      )}

      {step === "private" && (
        <PrivateMigration
          currencyName={info.currencyName}
          simulation={simulation}
          activationHeight={info.nu63ActivationHeight}
          walletHeight={info.walletHeight}
          latestBlock={info.latestBlock}
          onBack={() => setStep("strategy")}
          onExit={backToWallet}
        />
      )}

      {step === "confirm" && (
        <div className={cstyles.verticalflex}>
          <div className={`${cstyles.xlarge} ${cstyles.center}`}>Quick migration</div>
          <div className={`${cstyles.well} ${styles.card}`}>
            <p>You are about to move your Orchard funds to Ironwood in a single round of transactions.</p>
            <div className={cstyles.flexspacebetween}>
              <div className={cstyles.sublight}>Moving to Ironwood</div>
              <div>
                {info.currencyName} {Utils.maxPrecisionTrimmed(info.orchardMigratable)}
              </div>
            </div>
            <div className={cstyles.flexspacebetween}>
              <div className={cstyles.sublight}>Estimated fee</div>
              <div>
                {info.currencyName} {Utils.maxPrecisionTrimmed(info.orchardFee)}
              </div>
            </div>
            {info.orchardDust > 0 && (
              <div className={cstyles.flexspacebetween}>
                <div className={cstyles.sublight}>Left as dust</div>
                <div>
                  {info.currencyName} {Utils.maxPrecisionTrimmed(info.orchardDust)}
                </div>
              </div>
            )}
            <div className={`${cstyles.sublight} ${styles.privacynote}`}>
              This is the fast path. The migrated amount is publicly visible as it crosses the turnstile. For maximum
              privacy, use the private migration instead.
            </div>
          </div>

          {readOnly && (
            <div className={styles.infonote}>
              This is a view-only (UFVK) wallet. It has no spending key, so it cannot migrate.
            </div>
          )}
          {!ready && (
            <div className={styles.infonote}>
              <b>Simulation.</b> Ironwood (NU6.3) activates at block {info.nu63ActivationHeight.toLocaleString()} —{" "}
              {blocksToGo.toLocaleString()} blocks to go. The migration window isn&apos;t open yet, so nothing can be
              sent — but this is exactly how your funds will be migrated when it opens.
            </div>
          )}

          {canRun ? (
            <div className={styles.buttons}>
              <button type="button" className={cstyles.primarybutton} onClick={() => setStep("strategy")}>
                Back
              </button>
              <button type="button" className={cstyles.primarybutton} onClick={runQuickMigration}>
                Migrate now
              </button>
            </div>
          ) : (
            <div className={styles.buttons}>
              <button type="button" className={cstyles.primarybutton} onClick={backToWallet}>
                Back to wallet
              </button>
            </div>
          )}
        </div>
      )}

      {step === "executing" && (
        <div className={`${cstyles.verticalflex} ${cstyles.center}`}>
          <div className={cstyles.xlarge}>Migrating…</div>
          <div className={cstyles.sublight} style={{ marginTop: 12 }}>
            {drainProgress
              ? drainProgress.phase === "building"
                ? `Proving and signing transactions… ${drainProgress.built}/${drainProgress.total}`
                : `Broadcasting transactions… ${drainProgress.sent}/${drainProgress.total}`
              : "Proving and broadcasting your transactions."}
            <br />
            This can take a moment — please keep the app open.
          </div>
        </div>
      )}

      {step === "result" && (
        <div className={cstyles.verticalflex}>
          {resumedComplete && !result ? (
            // Resumed after navigating away: the detailed result was lost with the
            // original promise, but the migration finished. The wallet balance and
            // history carry the outcome.
            <>
              <div className={`${cstyles.xlarge} ${cstyles.center} ${cstyles.green}`}>Migration complete</div>
              <div className={`${cstyles.well} ${styles.card}`}>
                <div className={cstyles.sublight}>
                  Your Orchard funds have been migrated to Ironwood. Check your balance and transaction history for the
                  details.
                </div>
              </div>
            </>
          ) : error || !result ? (
            <>
              <div className={`${cstyles.xlarge} ${cstyles.center} ${cstyles.red}`}>Migration failed</div>
              <div className={`${cstyles.well} ${styles.card}`}>
                <div className={cstyles.sublight}>{error || "No result returned."}</div>
              </div>
            </>
          ) : (
            <>
              <div className={`${cstyles.xlarge} ${cstyles.center} ${cstyles.green}`}>Migration complete</div>
              <div className={`${cstyles.well} ${styles.card}`}>
                <div className={cstyles.flexspacebetween}>
                  <div className={cstyles.sublight}>Moved to Ironwood</div>
                  <div>
                    {info.currencyName} {zatsToZec(result.migrated)}
                  </div>
                </div>
                <div className={cstyles.flexspacebetween}>
                  <div className={cstyles.sublight}>Fees paid</div>
                  <div>
                    {info.currencyName} {zatsToZec(result.fee)}
                  </div>
                </div>
                {result.dust > 0 && (
                  <div className={cstyles.flexspacebetween}>
                    <div className={cstyles.sublight}>Left in Orchard (dust)</div>
                    <div>
                      {info.currencyName} {zatsToZec(result.dust)}
                    </div>
                  </div>
                )}
                <div className={cstyles.flexspacebetween}>
                  <div className={cstyles.sublight}>Transactions</div>
                  <div>{result.txids.length}</div>
                </div>
              </div>
            </>
          )}
          <div className={styles.buttons}>
            <button type="button" className={cstyles.primarybutton} onClick={backToWallet}>
              Back to wallet
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrchardMigration;
