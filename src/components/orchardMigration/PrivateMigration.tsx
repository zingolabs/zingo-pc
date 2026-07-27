import React, { useCallback, useEffect, useRef, useState } from "react";
import cstyles from "../common/Common.module.css";
import styles from "./PrivateMigration.module.css";
import Utils from "../../utils/utils";
import RPC from "../../rpc/rpc";
import { FfiBatchReport, FfiBatchStatus, FfiPlan, FfiStatus } from "./privateMigrationTypes";

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

// Spacing between sequential part broadcasts in a "Send now" tap, so a multi-part
// batch never leaves simultaneously. Matches zingo-mobile's BATCH_SEND_SPACING_MS.
const BATCH_SEND_SPACING_MS = 3000;

type PrivateMigrationProps = {
  currencyName: string;
  // Dry-run: the plan is computed and shown, but nothing can be sent because
  // Ironwood is not active yet (used from the pre-activation banner).
  simulation: boolean;
  activationHeight: number;
  walletHeight: number;
  // Chain tip (server latest block), for the block-based "next window opens at
  // block X (you're at Y)" line — height-gated, like mobile's MigrationStatus.
  latestBlock: number;
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

// Per-batch status → badge label + CSS class (reusing the existing badge palette).
const BATCH_BADGE: Record<FfiBatchStatus, { label: string; cls: string }> = {
  confirmed: { label: "Confirmed", cls: styles.badgeconfirmed },
  sending: { label: "Sending", cls: styles.badgebroadcasting },
  open: { label: "Open", cls: styles.badgebroadcasting },
  slipped: { label: "Late", cls: styles.badgequeued },
  overdue: { label: "Overdue", cls: styles.badgenext },
  scheduled: { label: "Scheduled", cls: styles.badgescheduled },
  rebuilding: { label: "Rebuilding", cls: styles.badgequeued },
  invalid: { label: "Invalid", cls: styles.badgequeued },
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

const PrivateMigration: React.FC<PrivateMigrationProps> = ({
  currencyName,
  simulation,
  activationHeight,
  walletHeight,
  latestBlock,
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
  // Confirmed batches render collapsed (just number + status) to keep the whole
  // list visible; the user expands one by clicking it. Holds the expanded ids.
  const [expandedBatches, setExpandedBatches] = useState<Set<number>>(new Set());
  const toggleBatch = useCallback((id: number) => {
    setExpandedBatches((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // User-triggered "Send now" (execute_due_parts) for the open/overdue window.
  const [sending, setSending] = useState<boolean>(false);
  const [sendStatus, setSendStatus] = useState<{ total: number; sent: number } | null>(null);
  const [sendReport, setSendReport] = useState<FfiBatchReport | null>(null);
  const [sendError, setSendError] = useState<string>("");
  // Two-step cancel: the button reveals a confirm, since abandoning the schedule
  // is destructive (though the funds stay safe in Orchard).
  const [confirmingCancel, setConfirmingCancel] = useState<boolean>(false);
  const [cancelling, setCancelling] = useState<boolean>(false);

  const cancelledRef = useRef<boolean>(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const totalTxsRef = useRef<number>(0);

  const roundCount = plan ? plan.split_rounds.length : 0;

  // Cancel any in-flight loop/timer on unmount.
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
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

  // User-triggered send of the open window's batch (plus any overdue windows'
  // parts, folded in by the engine). This is the DISCLOSED path: the ZIP 318
  // correlation notice was shown at the cadence choice. A 400ms poll mirrors the
  // live progress while the tap runs.
  const sendNow = useCallback(async () => {
    setSending(true);
    setSendReport(null);
    setSendError("");
    setSendStatus(null);
    pollRef.current = setInterval(async () => {
      const s = await RPC.executeDuePartsStatus();
      if (!cancelledRef.current) setSendStatus(s);
    }, 400);
    const { report, error: e } = await RPC.executeDueParts(BATCH_SEND_SPACING_MS);
    if (pollRef.current) clearInterval(pollRef.current);
    if (cancelledRef.current) return;
    setSendStatus(null);
    setSending(false);
    if (e) setSendError(e);
    else setSendReport(report);
    const s = await RPC.fetchMigrationStatus();
    if (!cancelledRef.current && s) setSchedule(s);
  }, []);

  // Abandon the in-progress migration and return to a fresh plan. The bound
  // notes go back to spendable Orchard; anything already in Ironwood stays.
  // Re-planning here lets the user start over cleanly (e.g. a legacy migration
  // stranded by an engine upgrade).
  const cancelMigration = useCallback(async () => {
    setCancelling(true);
    await RPC.cancelIronwoodMigration();
    if (cancelledRef.current) return;
    setConfirmingCancel(false);
    setCancelling(false);
    setSchedule(null);
    setSendReport(null);
    setSendError("");
    setStep("plan");
    setLoadingPlan(true);
    const p = await RPC.planIronwoodMigration();
    if (cancelledRef.current) return;
    setPlan(p);
    setLoadingPlan(false);
  }, []);

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

              {/* ZIP 318 correlation disclosure, shown once here at the cadence
                  choice — the schedule the user is consenting to. On-time sends
                  blend with the schedule; sending a missed window yourself happens
                  at a time you are active, so it can link the batches to you. */}
              <div className={styles.disclosure}>
                Each batch sends on its own window while the app is open. If you miss a window and send it yourself,
                sending at times you are active is what can link the batches to you — a steady, unhurried pattern helps.
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

      {/* ---------- Phase 2: split done, batches scheduled ----------
          The COMPLETE batch list, numbered 1..N, each with its live state
          (confirmed / sending / open / overdue / scheduled / …), gated by block
          height. Anchor + send-by are block numbers, never wall-clock. */}
      {step === "scheduled" &&
        (() => {
          const modulus = schedule?.bucket_modulus ?? 256;
          const batches = schedule?.batches ?? [];
          const batchesTotal = batches.length;
          const batchesConfirmed = batches.filter((b) => b.status === "confirmed").length;
          const complete =
            schedule?.phase?.kind === "complete" || (batchesTotal > 0 && batchesConfirmed === batchesTotal);
          // Progress by BATCHES sent (not by value: value_migrated is the whole
          // Ironwood balance, which includes value from earlier migrations, so a
          // value bar would over-report this migration).
          const pct = batchesTotal > 0 ? Math.round((batchesConfirmed / batchesTotal) * 100) : 0;
          // The current window ("open") is the auto-broadcaster's job — it fires
          // on-time while the app runs. The manual disclosed "Send now" is ONLY
          // for windows MISSED while the app was closed ("overdue"); a fresh,
          // on-schedule migration never needs it.
          const overdueExists = batches.some((b) => b.status === "overdue");
          const openExists = batches.some((b) => b.status === "open");
          // "Late": window passed but still within the slip tolerance — not yet
          // recoverable, so no button; just tell the user it will be shortly.
          const slippedExists = batches.some((b) => b.status === "slipped");

          return (
            <>
              {stepper(2)}
              <div className={`${cstyles.large} ${complete ? cstyles.green : ""}`}>
                {complete ? "Migration complete" : "Migrating to Ironwood"}
              </div>
              <div className={cstyles.sublight} style={{ marginTop: 6 }}>
                {complete
                  ? "All your batches have been sent to Ironwood. You're done — nothing else to do."
                  : "Your notes are split. Each batch sends to Ironwood once the chain reaches its window, automatically, while the app is open."}
              </div>

              {schedule && (
                <div className={`${cstyles.well} ${styles.card}`}>
                  <div className={styles.row}>
                    <span className={cstyles.sublight}>Batches sent</span>
                    <span className={styles.mono}>
                      {batchesConfirmed} of {batchesTotal}
                    </span>
                  </div>
                  <div className={styles.progresstrack}>
                    <div className={styles.progressfill} style={{ width: `${pct}%` }} />
                  </div>
                  <div className={styles.row}>
                    <span className={cstyles.sublight}>In Ironwood</span>
                    <span className={styles.mono}>
                      {fmtZats(schedule.value_migrated)} {currencyName}
                    </span>
                  </div>
                  <div className={styles.row}>
                    <span className={cstyles.sublight}>Left in Orchard</span>
                    <span className={styles.mono}>
                      {fmtZats(schedule.orchard_confirmed_spendable)} {currencyName}
                    </span>
                  </div>
                </div>
              )}

              {/* An OPEN window sends automatically — no user action. Say so, so a
                  fresh migration's first "open" batch doesn't read as stuck while
                  the auto-broadcaster waits for its anchor to be witnessed. */}
              {!complete && openExists && !overdueExists && (
                <div className={styles.infonote}>
                  A batch is in its window. It sends to Ironwood automatically while the app is open and synced —
                  nothing to do here. The first batch after splitting can take a while to become sendable.
                </div>
              )}

              {/* A slipped ("Late") batch is not yet recoverable — say so, so its
                  presence without a Send-now button doesn't read as stuck. */}
              {!complete && slippedExists && !overdueExists && (
                <div className={styles.infonote}>
                  A batch slipped just past its window. It becomes recoverable shortly — a &quot;Send now&quot; button
                  will appear once it does.
                </div>
              )}

              {/* Only a window MISSED while closed ("overdue") gets the manual,
                  disclosed "Send now" (execute_due_parts) — the auto-broadcaster
                  never fires a past window. It folds the missed parts into the
                  current window and surfaces the per-part reason if a send fails. */}
              {!complete && overdueExists && (
                <div className={`${cstyles.well} ${styles.card}`}>
                  <div className={styles.cardhead}>
                    <span className={styles.cardtitle}>A missed batch can be sent now</span>
                    <span className={`${styles.badge} ${styles.badgenext}`}>Overdue</span>
                  </div>
                  {sending ? (
                    <div className={cstyles.sublight}>
                      Sending{sendStatus ? ` ${sendStatus.sent} of ${sendStatus.total}` : ""}… keep the app open.
                    </div>
                  ) : (
                    <button type="button" className={cstyles.primarybutton} onClick={sendNow}>
                      Send this batch now
                    </button>
                  )}
                  {sendError && (
                    <div className={cstyles.sublight} style={{ marginTop: 8 }}>
                      {sendError} — your migration is safe; try again when you&apos;re ready.
                    </div>
                  )}
                  {sendReport &&
                    !sendError &&
                    (() => {
                      // execute_due_parts returns Ok even when nothing sends: the
                      // per-part outcome carries why. Break it down so "0 of N" is
                      // never a dead end.
                      //   slid    -> can't be witnessed yet (e.g. a part scheduled
                      //              before this build has no anchor); a full sync
                      //              draws it, then it sends. Not an error.
                      //   not_due -> its window hasn't opened yet.
                      //   failed  -> the server rejected it (reason shown); the
                      //              auto-broadcaster would have swallowed this.
                      const count = (k: string) => sendReport.outcomes.filter((o) => o.result.kind === k).length;
                      const sent = count("sent");
                      const slid = count("slid");
                      const notDue = count("not_due");
                      const failed = sendReport.outcomes.find((o) => o.result.kind === "failed");
                      const reason =
                        sendReport.halted ?? (failed && failed.result.kind === "failed" ? failed.result.error : null);
                      return (
                        <div className={cstyles.sublight} style={{ marginTop: 8 }}>
                          Sent {sent} of {sendReport.outcomes.length}.
                          {slid > 0 && (
                            <> {slid} not witnessable yet — let the wallet finish syncing, then try again.</>
                          )}
                          {notDue > 0 && <> {notDue} not due yet.</>}
                          {reason && (
                            <>
                              {" "}
                              A part was rejected: <span className={styles.mono}>{reason}</span>
                            </>
                          )}
                        </div>
                      );
                    })()}
                </div>
              )}

              {/* Block-gated "what's next" line (no wall-clock), like mobile's
                  MigrationStatus. next_wakes[0] is the soonest FUTURE window. */}
              {!complete && schedule && schedule.next_wakes.length > 0 && (
                <div className={styles.infonote}>
                  {latestBlock >= schedule.next_wakes[0].boundary
                    ? `A window is open (block ${schedule.next_wakes[0].boundary.toLocaleString()}) — its batch is sending. You're at block ${latestBlock.toLocaleString()}.`
                    : `Next batch opens at block ${schedule.next_wakes[0].boundary.toLocaleString()} — you're at block ${latestBlock.toLocaleString()}.`}
                </div>
              )}

              {/* Every batch, numbered 1..N, with its live state. Confirmed
                  batches collapse to just number + status (click to expand), so
                  the whole list stays visible. */}
              {batches.map((batch, i) => {
                const badge = BATCH_BADGE[batch.status];
                const collapsible = batch.status === "confirmed";
                const open = !collapsible || expandedBatches.has(batch.id);
                return (
                  <div
                    key={batch.id}
                    className={`${cstyles.well} ${styles.card}`}
                    style={collapsible ? { cursor: "pointer", paddingTop: 10, paddingBottom: 10 } : undefined}
                    role={collapsible ? "button" : undefined}
                    tabIndex={collapsible ? 0 : undefined}
                    onClick={collapsible ? () => toggleBatch(batch.id) : undefined}
                    onKeyDown={
                      collapsible ? (e) => (e.key === "Enter" || e.key === " ") && toggleBatch(batch.id) : undefined
                    }
                  >
                    <div className={styles.cardhead} style={open ? undefined : { marginBottom: 0 }}>
                      <span className={styles.cardtitle}>Batch {i + 1}</span>
                      <span className={`${styles.badge} ${badge.cls}`}>{badge.label}</span>
                    </div>
                    {open && (
                      <div className={styles.row}>
                        <span className={`${cstyles.sublight} ${styles.mono}`}>
                          {groupZats(batch.denominations)} {currencyName}
                        </span>
                        {batch.boundary > 0 && (
                          <span className={cstyles.sublight} style={{ fontSize: 11 }}>
                            Opens at block {batch.boundary.toLocaleString()} · send by{" "}
                            {(batch.boundary + modulus).toLocaleString()}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              <div className={styles.infonote}>
                {complete
                  ? "Your funds are now in the Ironwood pool."
                  : "Just keep the app open and let it run. If you close it and miss a window, it catches up automatically the next time you open it."}
              </div>

              {/* Cancel is offered only while the migration is still running. */}
              {!complete && confirmingCancel && (
                <div className={styles.infonote}>
                  This abandons the scheduled migration. Your remaining funds stay safe in Orchard; anything already
                  sent to Ironwood is unaffected. You can start a fresh migration afterwards.
                </div>
              )}

              <div className={styles.buttons}>
                <button type="button" className={cstyles.primarybutton} onClick={onExit}>
                  Back to wallet
                </button>
                {!complete &&
                  (confirmingCancel ? (
                    <button
                      type="button"
                      className={cstyles.primarybutton}
                      onClick={cancelMigration}
                      disabled={cancelling}
                    >
                      {cancelling ? "Cancelling…" : "Confirm cancel"}
                    </button>
                  ) : (
                    <button type="button" className={cstyles.primarybutton} onClick={() => setConfirmingCancel(true)}>
                      Cancel migration
                    </button>
                  ))}
              </div>
            </>
          );
        })()}
    </div>
  );
};

export default PrivateMigration;
