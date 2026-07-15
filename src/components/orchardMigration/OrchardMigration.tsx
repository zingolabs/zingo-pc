import React, { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import cstyles from "../common/Common.module.css";
import styles from "./OrchardMigration.module.css";
import { ContextApp } from "../../context/ContextAppState";
import routes from "../../constants/routes.json";
import Utils from "../../utils/utils";
import { RPCIronwoodDrainType } from "../../rpc/components/RPCIronwoodDrainType";
import { ironwoodReady } from "../../constants/ironwood";

type Step = "intro" | "choose" | "confirm" | "executing" | "result";

// Provided by Routes (runRPCDrainToIronwood): stops the sync loop, drains, and
// resumes — the drain syncs internally, so it cannot run while a sync is active.
type OrchardMigrationProps = {
  drainToIronwood: () => Promise<{ result: RPCIronwoodDrainType | null; error: string }>;
};

// The drain result reports zatoshis; the rest of the UI works in ZEC.
const zatsToZec = (zats: number): string => Utils.maxPrecisionTrimmed(zats / 100_000_000);

const OrchardMigration: React.FC<OrchardMigrationProps> = ({ drainToIronwood }) => {
  const navigate = useNavigate();
  const { totalBalance, readOnly, info } = useContext(ContextApp);

  // Ironwood only exists once the wallet has synced to the NU6.3 activation block.
  const ready: boolean = ironwoodReady(info.nu63ActivationHeight, info.walletHeight);

  const [step, setStep] = useState<Step>("intro");
  const [result, setResult] = useState<RPCIronwoodDrainType | null>(null);
  const [error, setError] = useState<string>("");

  // Confirmed (spendable) balance — that is what the drain can actually move,
  // and it matches the Dashboard banner's gate.
  const orchardBalance: number = totalBalance ? totalBalance.confirmedOrchardBalance : 0;

  const backToWallet = () => navigate(routes.DASHBOARD, { replace: true, state: {} });

  // Happy path: one-shot drain of the whole Orchard balance into Ironwood.
  const runQuickMigration = async () => {
    setStep("executing");
    setError("");
    setResult(null);
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
            <button type="button" className={cstyles.primarybutton} onClick={() => setStep("choose")}>
              Next
            </button>
          </div>
        </div>
      )}

      {step === "choose" && (
        <div className={cstyles.verticalflex}>
          <div className={`${cstyles.xlarge} ${cstyles.center}`}>Choose how to migrate</div>

          <div
            role="button"
            tabIndex={0}
            className={`${cstyles.well} ${styles.card} ${styles.choicecard}`}
            onClick={() => setStep("confirm")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setStep("confirm");
              }
            }}
          >
            <div className={cstyles.highlight}>Quick migration</div>
            <div className={cstyles.sublight}>
              Move all your Orchard funds to Ironwood in one step. Fast, but less private — the migrated amount is
              publicly visible as it crosses the turnstile.
            </div>
          </div>

          <div className={`${cstyles.well} ${styles.card} ${styles.choicedisabled}`} aria-disabled="true">
            <div className={cstyles.flexspacebetween}>
              <div className={cstyles.highlight}>Private migration</div>
              <div className={cstyles.yellow}>Coming soon</div>
            </div>
            <div className={cstyles.sublight}>
              Split your balance into standard denominations and send it in randomized time windows for maximum privacy.
            </div>
          </div>

          <div className={styles.buttons}>
            <button type="button" className={cstyles.primarybutton} onClick={() => setStep("intro")}>
              Back
            </button>
          </div>
        </div>
      )}

      {step === "confirm" && (
        <div className={cstyles.verticalflex}>
          <div className={`${cstyles.xlarge} ${cstyles.center}`}>Quick migration</div>
          <div className={`${cstyles.well} ${styles.card}`}>
            <p>You are about to move your entire Orchard balance to Ironwood in a single round of transactions.</p>
            <div className={cstyles.flexspacebetween}>
              <div className={cstyles.sublight}>Orchard balance to migrate</div>
              <div>
                {info.currencyName} {Utils.maxPrecisionTrimmed(orchardBalance)}
              </div>
            </div>
            <div className={`${cstyles.sublight} ${styles.privacynote}`}>
              This is the fast path. The migrated amount is publicly visible as it crosses the turnstile. For maximum
              privacy, use the private migration instead.
            </div>
            {readOnly && (
              <div className={`${cstyles.red} ${styles.privacynote}`}>
                This is a view-only (UFVK) wallet. It has no spending key, so it cannot migrate.
              </div>
            )}
            {!ready && (
              <div className={`${cstyles.red} ${styles.privacynote}`}>
                Ironwood is not active on your wallet yet. Finish syncing to the NU6.3 activation block first.
              </div>
            )}
          </div>
          <div className={styles.buttons}>
            <button type="button" className={cstyles.primarybutton} onClick={() => setStep("choose")}>
              Back
            </button>
            <button
              type="button"
              className={cstyles.primarybutton}
              disabled={readOnly || !ready || orchardBalance <= 0}
              onClick={runQuickMigration}
            >
              Migrate now
            </button>
          </div>
        </div>
      )}

      {step === "executing" && (
        <div className={`${cstyles.verticalflex} ${cstyles.center}`}>
          <div className={cstyles.xlarge}>Migrating…</div>
          <div className={cstyles.sublight} style={{ marginTop: 12 }}>
            Proving and broadcasting your transactions. This can take a moment — please keep the app open.
          </div>
        </div>
      )}

      {step === "result" && (
        <div className={cstyles.verticalflex}>
          {error || !result ? (
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
