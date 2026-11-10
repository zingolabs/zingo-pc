import { useCallback, useEffect, useRef, useState } from "react";
import Modal from "react-modal";
import cstyles from "../../common/Common.module.css";
import RPC from "../../../rpc/rpc";
import { useCopy } from "../../common/useCopy";
import {
  DoctorRowState,
  DoctorRun,
  DoctorState,
  DoctorStep,
  DoctorStepState,
  DoctorTone,
  DoctorVerdict,
  diagnose,
  doctorReport,
  doctorRows,
  doctorSteps,
  historyLines,
  lastCause,
} from "../../../rpc/components/mixnetDoctor";

// Fast enough that a bootstrap reads as it happens. It only reads what main has
// already recorded, so it costs no network. Faster during a run, for the steps.
const REFRESH_MS = 2000;
const REFRESH_RUNNING_MS = 500;

export const TONE_CLASS: Record<DoctorTone, string> = {
  ok: cstyles.green,
  warn: cstyles.yellow,
  bad: cstyles.red,
  neutral: "",
};

const STEP_MARK: Record<DoctorStepState, string> = { ok: "✓", fail: "✗", running: "…", unchecked: "–" };
const STEP_CLASS: Record<DoctorStepState, string> = {
  ok: cstyles.green,
  fail: cstyles.red,
  running: cstyles.sublight,
  unchecked: cstyles.sublight,
};

const ROW_MARK: Record<DoctorRowState, string> = { ok: "✓", fail: "✗", skip: "–" };
const ROW_CLASS: Record<DoctorRowState, string> = { ok: cstyles.green, fail: cstyles.red, skip: cstyles.sublight };

const clock = (at: number) => new Date(at).toLocaleTimeString();

export type MixnetDoctorHandle = {
  state: DoctorState | null;
  run: DoctorRun | null;
  running: boolean;
  // The run measured a connection that is no longer the one in use.
  stale: boolean;
  copied: boolean;
  verdict: DoctorVerdict | null;
  steps: DoctorStep[] | null;
  runDiagnostics: () => Promise<void>;
  copyReport: () => void;
};

/**
 * The evaluation of the Nym transport, for the Mixnet screen.
 *
 * What main has recorded is read while the screen is open, because it is what is
 * left of a failure once it has passed. The measuring waits for the button, because
 * one leg goes from the real IP and zingolib keeps that a thing the user asks for,
 * never something a screen does by being opened.
 */
export function useMixnetDoctor(): MixnetDoctorHandle {
  const [state, setState] = useState<DoctorState | null>(null);
  const [run, setRun] = useState<DoctorRun | null>(null);
  // The transport's status when the run finished, which is what its answers are about.
  const [runMode, setRunMode] = useState<string | null>(null);
  const [running, setRunning] = useState<boolean>(false);
  const { copied, copy } = useCopy(1500);
  const mounted = useRef<boolean>(true);

  const refresh = useCallback(async () => {
    try {
      const next = await RPC.getMixnetDoctorState();
      if (mounted.current && next) setState(next);
      return next;
    } catch {
      // The last reading stays up. A failed read is not news about the mixnet.
      return null;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    refresh();
    const tick = setInterval(refresh, running ? REFRESH_RUNNING_MS : REFRESH_MS);
    return () => clearInterval(tick);
  }, [refresh, running]);

  const runDiagnostics = async () => {
    setRunning(true);
    setRun(null);
    try {
      const finished = await RPC.runMixnetDoctor();
      if (mounted.current) setRun(finished);
      const after = await refresh();
      if (mounted.current) setRunMode(after?.status.mode ?? null);
    } finally {
      if (mounted.current) setRunning(false);
    }
  };

  // A run answers for the transport it measured. Once the status has moved on or the
  // proxy has been replaced, the screen says what is true now, and the run stays only
  // for the details and report, marked as past.
  const current = run && state?.status.mode === runMode && state.proxy.socks5Addr === run.socks5Addr ? run : null;
  const stale = !!run && !current;

  const copyReport = () => {
    if (!state) return;
    copy(doctorReport(state, run, stale));
  };

  const legs = current ?? (running ? (state?.doctorProgress ?? {}) : null);
  return {
    state,
    run,
    running,
    stale,
    copied,
    verdict: state ? diagnose(state, current) : null,
    steps: state && legs ? doctorSteps(state, legs) : null,
    runDiagnostics,
    copyReport,
  };
}

// Four answers and nothing else: the sentence above says what they add up to, and
// the figures behind them are in the technical details.
export const DoctorSteps = ({ steps }: { steps: DoctorStep[] }) => (
  <div style={{ margin: "16px auto 0", width: "fit-content" }}>
    {steps.map((step) => (
      <div key={step.label} style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <span className={STEP_CLASS[step.state]} style={{ width: 16, textAlign: "center" }}>
          {STEP_MARK[step.state]}
        </span>
        <span className={step.state === "unchecked" ? cstyles.sublight : undefined}>{step.label}</span>
        {step.state === "unchecked" && <span className={cstyles.sublight}>not checked</span>}
        {step.note && <span className={cstyles.sublight}>{step.note}</span>}
      </div>
    ))}
  </div>
);

// Everything a report is made of, for whoever is reading it to find a fault. Wide
// for the journal's lines, and only as tall as it needs to be: the data scrolls as
// one and the two buttons stay in reach.
export const DoctorTechnicalDetails = ({
  doctor,
  closeModal,
}: {
  doctor: MixnetDoctorHandle;
  closeModal: () => void;
}) => {
  const { state, run, stale } = doctor;
  if (!state) return null;

  const history = historyLines(state.session?.attempts ?? []);
  const cause = lastCause(state);
  // Newest first: the line that matters when something just went wrong is the last
  // one written, and it should not take a scroll to reach.
  const journal = state.journal.slice().reverse();

  return (
    <Modal
      isOpen
      onRequestClose={closeModal}
      className={cstyles.centredsheet}
      overlayClassName={cstyles.modalOverlay}
      style={{
        content: {
          width: "min(960px, calc(100vw - 64px))",
          maxHeight: "min(560px, calc(100vh - 240px))",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        },
      }}
    >
      <div className={cstyles.xlarge} style={{ textAlign: "center" }}>
        Technical details
      </div>

      <div className={cstyles.small} style={{ marginTop: 16, flex: 1, minHeight: 0, overflowY: "auto" }}>
        <div className={cstyles.sublight}>
          The mixnet hides your IP from the indexer when you send. Disabling it routes this session over clearnet:
          faster, but the indexer sees your IP. The choice is never saved; the mixnet re-enables on the next launch. The
          ZEC price is fetched over the mixnet only and never over clearnet, so USD values stay blank while this is off.
        </div>

        {run && (
          <div style={{ margin: "12px 80px 0" }}>
            {stale && (
              <div className={cstyles.yellow}>
                Measured at {clock(run.startedAt)}, on a connection that has since changed. Run diagnostics again to
                measure this one.
              </div>
            )}
            {doctorRows(run).map((row) => (
              <div key={row.label} style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <span className={ROW_CLASS[stale ? "skip" : row.state]}>{ROW_MARK[stale ? "skip" : row.state]}</span>
                <span style={{ flexShrink: 0 }}>{row.label}</span>
                <span
                  className={cstyles.sublight}
                  style={{ marginLeft: "auto", textAlign: "right", overflowWrap: "anywhere" }}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className={cstyles.sublight} style={{ marginTop: 12, overflowWrap: "anywhere" }}>
          <div>
            Server {state.session?.indexer ?? "none"}, status {state.status.mode}
            {state.proxy.socks5Addr ? `, tunnel ${state.proxy.socks5Addr}` : ""}
          </div>
          <div>
            This session: {state.stats.bootstraps} connection attempts, ready {state.stats.timesReady} times,{" "}
            {state.stats.proxyExits} proxy exits, {state.stats.walletDeaths + state.stats.attachesFailed} wallet
            failures, {state.stats.restarts} restarts, {state.stats.redraws} redraws
            {state.nextRetryMs !== null && `, next retry within ${Math.round(state.nextRetryMs / 1000)}s`}
          </div>
          {cause && <div>Last cause: {cause}</div>}
          {history.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>

        <div
          data-testid="mixnet-doctor-journal"
          style={{
            marginTop: 12,
            fontFamily: "monospace",
            overflowWrap: "anywhere",
          }}
        >
          {journal.length === 0 && <div className={cstyles.sublight}>Nothing has happened yet.</div>}
          {journal.map((entry, index) => (
            <div
              key={`${entry.at}-${journal.length - index}`}
              className={entry.level === "error" ? cstyles.red : entry.level === "warn" ? cstyles.yellow : undefined}
            >
              {clock(entry.at)} {entry.source}: {entry.text}
            </div>
          ))}
        </div>

        <div className={cstyles.sublight} style={{ marginTop: 12 }}>
          The report holds servers, exits, times and errors, never keys, addresses or balances.
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", marginTop: 16 }}>
        <button type="button" className={cstyles.primarybutton} onClick={doctor.copyReport}>
          {doctor.copied ? "Copied" : "Copy report"}
        </button>
        <button type="button" className={cstyles.secondarybutton} onClick={closeModal}>
          Close
        </button>
      </div>
    </Modal>
  );
};
