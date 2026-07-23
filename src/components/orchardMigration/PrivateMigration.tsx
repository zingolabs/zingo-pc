import React, { useCallback, useEffect, useRef, useState } from "react";
import cstyles from "../common/Common.module.css";
import styles from "./PrivateMigration.module.css";
import Utils from "../../utils/utils";
import RPC from "../../rpc/rpc";
import { FfiPlan, FfiStatus } from "./privateMigrationTypes";

// Private migration — the true scheduled (split) path, mirroring zingo-mobile's
// MigrationSplitting flow. zingolib only exposes step primitives; the client
// orchestrates:
//
//   Phase 1 — Split. start_ironwood_migration(plan_hash, per_bucket) schedules
//   the migration, then we drive continue_note_splitting() one step per tick
//   until "splitting_complete". Each tick either builds+broadcasts the next
//   round of Orchard self-sends (slow: Halo2 proving) or reports what the round
//   is waiting on. The loop RELIES on the app's continuous background sync to
//   bring in the confirmations the next tick observes.
//
//   Phase 2 — Send batches. Once splitting completes the parts are bound and
//   scheduled into time windows; the background auto_broadcast_if_due (driven
//   from the sync loop) ships each window's batch while the app is open. This
//   screen then just shows the schedule.
//
// If the app dies mid-flight, migration_status() on re-entry lands the user on
// the right step instead of an empty view (the rescue path).
type Step = "plan" | "splitting" | "scheduled";

// Round-granular truth is all the splitting API offers (no per-tx build side
// channel like the drain's): a row is queued until its round broadcasts, sent
// until its txid leaves the pending list, then confirmed.
type TxStatus = "queued" | "sent" | "confirmed";
type RowData = { round: number; label: string; txid: string | null; status: TxStatus };

// How often the driver re-checks a pending round. Confirmations land with new
// blocks, so a 15s cadence notices them promptly without hammering the wallet.
const POLL_MS = 15 * 1000;

type PrivateMigrationProps = {
  currencyName: string;
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
const fmtZats = (z: number): string => fmt(zatsToZec(z));

// A list of amounts (zats) collapsed to grouped text, largest first, with
// repeats shown as a count: [10,10,10,1,1,1,1,1] -> "10 (3x), 1 (5x)".
const groupZats = (values: number[]): string => {
  const groups: { value: number; count: number }[] = [];
  for (const v of values) {
    const existing = groups.find((g) => g.value === v);
    if (existing) existing.count += 1;
    else groups.push({ value: v, count: 1 });
  }
  groups.sort((a, b) => b.value - a.value);
  return groups.map((g) => (g.count > 1 ? `${fmtZats(g.value)} (${g.count}x)` : fmtZats(g.value))).join(", ");
};

const rowsFromPlan = (p: FfiPlan): RowData[] =>
  p.split_rounds.flatMap((round, r) =>
    round.map((tx) => ({ round: r, label: groupZats(tx.outputs), txid: null, status: "queued" as TxStatus })),
  );

// Round N only builds after round N-1's outputs confirmed: mark every earlier
// round confirmed, the just-broadcast round sent.
const applyBroadcast = (prev: RowData[], round: number, txids: string[]): RowData[] => {
  let assigned = 0;
  return prev.map((row) => {
    if (row.round < round) return { ...row, status: "confirmed" as TxStatus };
    if (row.round === round) {
      const txid = txids[assigned] ?? null;
      assigned += 1;
      return { ...row, txid, status: "sent" as TxStatus };
    }
    return row;
  });
};

// A sent row whose txid is no longer in the pending list has confirmed.
const applyPending = (prev: RowData[], pending: string[]): RowData[] => {
  const stillPending = new Set(pending);
  return prev.map((row) =>
    row.status === "sent" && row.txid && !stillPending.has(row.txid)
      ? { ...row, status: "confirmed" as TxStatus }
      : row,
  );
};

const estTime = (unix: number): string => (unix > 0 ? new Date(unix * 1000).toLocaleString() : "—");

const PrivateMigration: React.FC<PrivateMigrationProps> = ({
  currencyName,
  simulation,
  activationHeight,
  walletHeight,
  onBack,
  onExit,
}) => {
  const [step, setStep] = useState<Step>("plan");
  const [plan, setPlan] = useState<FfiPlan | null>(null);
  const [loadingPlan, setLoadingPlan] = useState<boolean>(true);
  // per_bucket: how many parts share each broadcast window. 0 = engine default
  // (fewer, larger windows); 1 = one part per window (more windows, more spread).
  const [perBucket, setPerBucket] = useState<number>(0);
  const [rows, setRows] = useState<RowData[]>([]);
  const [headline, setHeadline] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [schedule, setSchedule] = useState<FfiStatus | null>(null);

  const cancelledRef = useRef<boolean>(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const totalTxsRef = useRef<number>(0);

  const roundCount = plan ? plan.split_rounds.length : 0;

  // Cancel any in-flight loop/timer on unmount.
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Keep the terminal screen live: parts confirm and new windows arm as blocks
  // arrive, so re-read status every 10s while it is shown.
  useEffect(() => {
    if (step !== "scheduled") return;
    let active = true;
    const id = setInterval(async () => {
      const s = await RPC.fetchMigrationStatus();
      if (active && s) setSchedule(s);
    }, 10_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [step]);

  const goScheduled = useCallback(async () => {
    const status = await RPC.fetchMigrationStatus();
    if (cancelledRef.current) return;
    setSchedule(status);
    setStep("scheduled");
  }, []);

  // The splitting loop. One driver call per tick: build+broadcast the next round
  // (slow), report the pending round's remaining txids (fast), or report
  // completion. Between ticks the app's background sync brings in the
  // confirmations the next tick observes. Stable (functional setState + refs).
  const drive = useCallback(async () => {
    if (cancelledRef.current) return;
    const { step: s, error: e } = await RPC.continueNoteSplitting();
    if (cancelledRef.current) return;

    if (e || !s) {
      // A transmit failure leaves a reconcilable state; Retry re-enters the loop.
      setError(e || "Malformed splitting step.");
      return;
    }

    if (s.step === "splitting_complete") {
      setRows((prev) => prev.map((row) => ({ ...row, status: "confirmed" as TxStatus })));
      await goScheduled();
      return;
    }

    if (s.step === "round_broadcast") {
      setRows((prev) => applyBroadcast(prev, s.round, s.txids));
      setHeadline(
        roundCount > 1 ? `Confirming round ${s.round + 1} of ${roundCount}…` : "Confirming your split transaction…",
      );
      timerRef.current = setTimeout(drive, POLL_MS);
      return;
    }

    // awaiting_confirmation: pending lists what is still in flight; empty means
    // confirmed but the anchor hasn't reached the outputs yet.
    setRows((prev) => applyPending(prev, s.pending));
    setHeadline(
      s.pending.length === 0
        ? roundCount > 1
          ? "Preparing the next round…"
          : "Finalizing…"
        : "Confirming your split transactions…",
    );
    timerRef.current = setTimeout(drive, POLL_MS);
  }, [roundCount, goScheduled]);

  // Load the plan, or — if a migration is already in progress — resume where it
  // stands (rescue re-entry) instead of showing an empty plan view.
  useEffect(() => {
    let active = true;
    (async () => {
      if (!simulation) {
        const status = await RPC.fetchMigrationStatus();
        if (!active) return;
        const phase = status?.phase;
        if (phase) {
          if (phase.kind === "parts_scheduled" || phase.kind === "complete") {
            setSchedule(status);
            setStep("scheduled");
            setLoadingPlan(false);
            return;
          }
          if (phase.kind === "note_splitting" || phase.kind === "planned") {
            // Coarse rows: one per pending transaction, values unknown.
            const round = phase.kind === "note_splitting" ? phase.round : 0;
            const pending = phase.kind === "note_splitting" ? phase.pending_txids : [];
            setRows(pending.map((txid) => ({ round, label: "", txid, status: "sent" as TxStatus })));
            setHeadline("Resuming your migration…");
            setStep("splitting");
            setLoadingPlan(false);
            cancelledRef.current = false;
            drive();
            return;
          }
        }
      }
      const p = await RPC.planIronwoodMigration();
      if (!active) return;
      setPlan(p);
      setLoadingPlan(false);
    })();
    return () => {
      active = false;
    };
  }, [simulation, drive]);

  const start = useCallback(async () => {
    if (!plan) return;
    const built = rowsFromPlan(plan);
    totalTxsRef.current = built.length;
    setRows(built);
    setError("");
    setHeadline("Splitting your notes…");
    setStep("splitting");
    const ok = await RPC.startIronwoodMigration(plan.plan_hash, perBucket);
    if (cancelledRef.current) return;
    if (!ok) {
      setError("Could not start the migration. Please try again.");
      return;
    }
    cancelledRef.current = false;
    drive();
  }, [plan, perBucket, drive]);

  const retry = useCallback(() => {
    setError("");
    cancelledRef.current = false;
    drive();
  }, [drive]);

  const totalFee = plan ? zatsToZec(plan.split_fee + plan.parts_fee) : 0;
  const splitTxCount = plan ? plan.split_rounds.reduce((n, round) => n + round.length, 0) : 0;
  const blocksToGo = Math.max(activationHeight - walletHeight, 0);

  const confirmedCount = rows.filter((r) => r.status === "confirmed").length;
  const sentCount = rows.filter((r) => r.status === "sent").length;
  const total = totalTxsRef.current;
  const progressPct = total > 0 ? Math.min(100, ((confirmedCount * 2 + sentCount) / (2 * total)) * 100) : 6;

  const badgeFor = (s: TxStatus): { cls: string; label: string } => {
    if (s === "confirmed") return { cls: styles.badgeconfirmed, label: "Confirmed" };
    if (s === "sent") return { cls: styles.badgebroadcasting, label: "Sending" };
    return { cls: styles.badgequeued, label: "Queued" };
  };

  // Two-phase stepper header: (1) Split notes — (2) Send batches.
  const stepper = (phase: 1 | 2) => (
    <div className={styles.stepper}>
      <div className={`${styles.step} ${phase > 1 ? styles.stepdone : styles.stepactive}`}>
        <span className={styles.stepnum}>1</span>
        <span className={styles.steplabel}>Split notes</span>
      </div>
      <span className={styles.stepline} />
      <div className={`${styles.step} ${phase === 2 ? styles.stepactive : ""}`}>
        <span className={styles.stepnum}>2</span>
        <span className={styles.steplabel}>Send batches</span>
      </div>
    </div>
  );

  return (
    <div className={styles.container}>
      {/* Top exit for the in-progress detail screens (reached from the banner's
          Details link): their lists can be long, so don't force a scroll to the
          bottom button to leave. */}
      {(step === "splitting" || step === "scheduled") && (
        <div className={styles.topbar}>
          <button type="button" className={styles.exitlink} onClick={onExit}>
            Back to wallet
          </button>
        </div>
      )}

      {/* ---------- Review the plan + choose cadence, then start ---------- */}
      {step === "plan" && (
        <>
          {stepper(1)}
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
                Your Orchard notes are standardized into common denominations, then sent to Ironwood in timed batches
                that blend with other users.
              </div>

              <div className={`${cstyles.well} ${styles.card}`}>
                <div className={styles.row}>
                  <span className={cstyles.sublight}>Parts to send</span>
                  <span className={styles.mono}>{plan.parts.length}</span>
                </div>
                <div className={styles.row}>
                  <span className={cstyles.sublight}>Denominations</span>
                  <span className={styles.mono}>
                    {groupZats(plan.parts)} {currencyName}
                  </span>
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
                      {fmtZats(plan.stranded)} {currencyName}
                    </span>
                  </div>
                )}
              </div>

              {/* Cadence choice (chosen BEFORE start — the engine schedules at start). */}
              <div className={cstyles.sublight} style={{ marginTop: 16 }}>
                How should the batches be spread?
              </div>
              <div
                role="button"
                tabIndex={0}
                className={`${cstyles.well} ${styles.card} ${styles.choicecard} ${
                  perBucket === 0 ? styles.choiceselected : ""
                }`}
                onClick={() => setPerBucket(0)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setPerBucket(0)}
              >
                <div className={cstyles.highlight}>Fewer batches (recommended)</div>
                <div className={cstyles.sublight}>
                  Larger windows: fewer times you need to open the app, still spread over the migration period.
                </div>
              </div>
              <div
                role="button"
                tabIndex={0}
                className={`${cstyles.well} ${styles.card} ${styles.choicecard} ${
                  perBucket === 1 ? styles.choiceselected : ""
                }`}
                onClick={() => setPerBucket(1)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setPerBucket(1)}
              >
                <div className={cstyles.highlight}>More batches (more private)</div>
                <div className={cstyles.sublight}>
                  One shipment per window: the most spread and the least correlation, but more app opens.
                </div>
              </div>

              <div className={styles.infonote}>
                {splitTxCount > 0 ? (
                  <>
                    Splitting runs in {plan.split_rounds.length} round{plan.split_rounds.length === 1 ? "" : "s"}, each
                    waiting to confirm — keep the app open until Phase 1 finishes. The batches then send over their
                    windows whenever the app is open.
                  </>
                ) : (
                  <>
                    Your notes are already standardized, so Phase 1 is quick. The batches then send over their windows
                    whenever the app is open.
                  </>
                )}
              </div>

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
                  <button type="button" className={cstyles.primarybutton} onClick={start}>
                    Start migration
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ---------- Phase 1: driving the split loop ---------- */}
      {step === "splitting" && (
        <>
          {stepper(1)}
          <div className={cstyles.large}>Splitting your notes</div>

          {error ? (
            <>
              <div className={`${cstyles.well} ${styles.card}`}>
                <div className={cstyles.sublight}>{error}</div>
              </div>
              <div className={styles.infonote}>
                Your migration is safe and can continue — retry to pick up where it left off.
              </div>
              <div className={styles.buttons}>
                <button type="button" className={cstyles.primarybutton} onClick={onExit}>
                  Back to wallet
                </button>
                <button type="button" className={cstyles.primarybutton} onClick={retry}>
                  Retry
                </button>
              </div>
            </>
          ) : (
            <>
              <div className={cstyles.sublight} style={{ marginTop: 6 }}>
                {headline || "Working…"}
              </div>
              <div className={styles.progresstrack}>
                <div className={styles.progressfill} style={{ width: `${progressPct}%` }} />
              </div>

              {rows.map((row, i) => {
                const badge = badgeFor(row.status);
                return (
                  <div key={i} className={`${cstyles.well} ${styles.card}`}>
                    <div className={styles.cardhead}>
                      <span className={styles.cardtitle}>Transaction {i + 1}</span>
                      <span className={`${styles.badge} ${badge.cls}`}>{badge.label}</span>
                    </div>
                    {row.label && (
                      <div className={`${cstyles.sublight} ${styles.mono}`}>
                        {row.label} {currencyName}
                      </div>
                    )}
                  </div>
                );
              })}

              <div className={styles.infonote}>
                Keep the app open. This runs in rounds and can take a few minutes while each split confirms.
              </div>
            </>
          )}
        </>
      )}

      {/* ---------- Phase 2: split done, batches scheduled ---------- */}
      {step === "scheduled" &&
        (() => {
          const total = schedule?.parts_total ?? 0;
          const done = schedule?.parts_confirmed ?? 0;
          const complete = total > 0 && done >= total;
          const wakes = schedule?.next_wakes ?? [];
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;

          return (
            <>
              {stepper(2)}
              <div className={`${cstyles.large} ${complete ? cstyles.green : ""}`}>
                {complete ? "Migration complete" : "Migrating to Ironwood"}
              </div>
              <div className={cstyles.sublight} style={{ marginTop: 6 }}>
                {complete
                  ? "All your batches have been sent to Ironwood. You're done — nothing else to do."
                  : "Your notes are split. The batches now send to Ironwood over their time windows, automatically, while the app is open."}
              </div>

              {schedule && (
                <div className={`${cstyles.well} ${styles.card}`}>
                  <div className={styles.row}>
                    <span className={cstyles.sublight}>Batches sent</span>
                    <span className={styles.mono}>
                      {done} of {total}
                    </span>
                  </div>
                  <div className={styles.progresstrack}>
                    <div className={styles.progressfill} style={{ width: `${pct}%` }} />
                  </div>
                  <div className={styles.row}>
                    <span className={cstyles.sublight}>Value migrated</span>
                    <span className={styles.mono}>
                      {fmtZats(schedule.value_migrated)}/{fmtZats(schedule.value_total)} {currencyName}
                    </span>
                  </div>
                </div>
              )}

              {/* Upcoming windows, when any are in view. */}
              {wakes.map((wake, i) => (
                <div key={i} className={`${cstyles.well} ${styles.card}`}>
                  <div className={styles.cardhead}>
                    <span className={styles.cardtitle}>Window {i + 1}</span>
                    <span className={`${styles.badge} ${i === 0 ? styles.badgenext : styles.badgescheduled}`}>
                      {i === 0 ? "Next" : "Scheduled"}
                    </span>
                  </div>
                  <div className={styles.row}>
                    <span className={styles.mono}>
                      {groupZats(wake.denominations)} {currencyName}
                    </span>
                    <span className={`${cstyles.sublight} ${styles.mono}`}>{estTime(wake.estimated_unix_time)}</span>
                  </div>
                </div>
              ))}

              {/* No window in view yet, still migrating: reassure instead of an
                  empty list. The next batch sends on its own; the user only has
                  to leave the app open. */}
              {schedule && !complete && wakes.length === 0 && (
                <div className={`${cstyles.well} ${styles.card}`}>
                  <div className={styles.cardhead}>
                    <span className={styles.cardtitle}>Waiting for the next window</span>
                    <span className={`${styles.badge} ${styles.badgescheduled}`}>On schedule</span>
                  </div>
                  <div className={cstyles.sublight}>
                    Your remaining batches are spread across the coming windows to protect your privacy. They send by
                    themselves while the app is open — there&apos;s nothing you need to do. Feel free to keep using your
                    wallet in the meantime.
                  </div>
                </div>
              )}

              <div className={styles.infonote}>
                {complete
                  ? "Your funds are now in the Ironwood pool."
                  : "Just keep the app open and let it run. If you close it and miss a window, it catches up automatically the next time you open it."}
              </div>

              <div className={styles.buttons}>
                <button type="button" className={cstyles.primarybutton} onClick={onExit}>
                  Back to wallet
                </button>
              </div>
            </>
          );
        })()}
    </div>
  );
};

export default PrivateMigration;
