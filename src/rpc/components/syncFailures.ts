// The run of failed sync sessions, and whether it has stopped the cycle.
//
// A server answers with an error of some kind every so often, whatever zingolib
// calls it, and one such answer says nothing about the next. The cycle stops
// launching sessions only once a failure has held: FAILURES_BEFORE_HALT
// sessions in a row, over at least SPAN_BEFORE_HALT_MS, with no block scanned
// between them. zingolib's classification then says what the halt is about.
//
// Nothing here has effects. RPC folds outcomes in and acts on what derives
// from the result, the same way it treats serverHealth.

import { SyncRecovery, syncFailureMessage } from "../syncFailureMessage";

// One failure is what a machine waking from sleep produces every time. Two in
// a row outlived their own recovery, and that is worth the screen.
const FAILURES_BEFORE_BANNER = 2;
const FAILURES_BEFORE_HALT = 6;
const SPAN_BEFORE_HALT_MS = 2 * 60 * 1000;

export type SyncHalt =
  | { readonly kind: "none" }
  // The server answers, but the wallet cannot sync from it. Another server is
  // the remedy.
  | { readonly kind: "serverCannotServe"; readonly reason: string }
  // The wallet's own state is broken. No server changes that, a rescan does.
  | { readonly kind: "walletNeedsRescan"; readonly reason: string };

export type SyncFailureState = {
  readonly failures: number;
  readonly firstFailureAt: number | null;
  readonly lastReason: string;
  // Blocks scanned in the last status read, and when the last failure came. A
  // higher figure after a failure is progress, and progress ends the run.
  readonly scanned: number;
  readonly scannedAtFailure: number;
  readonly halt: SyncHalt;
};

export const INITIAL_SYNC_FAILURES: SyncFailureState = {
  failures: 0,
  firstFailureAt: null,
  lastReason: "",
  scanned: 0,
  scannedAtFailure: 0,
  halt: { kind: "none" },
};

const haltFor = (reason: string, recovery?: SyncRecovery): SyncHalt =>
  recovery === "abort" ? { kind: "walletNeedsRescan", reason } : { kind: "serverCannotServe", reason };

const endRun = (state: SyncFailureState): SyncFailureState => ({
  ...state,
  failures: 0,
  firstFailureAt: null,
  lastReason: "",
});

/** Fold one failed session, or one failed poll, into the run. */
export function recordSyncFailure(
  state: SyncFailureState,
  reason: string,
  recovery: SyncRecovery | undefined,
  at: number,
): SyncFailureState {
  const failures = state.failures + 1;
  const firstFailureAt = state.firstFailureAt ?? at;
  const held = failures >= FAILURES_BEFORE_HALT && at - firstFailureAt >= SPAN_BEFORE_HALT_MS;
  return {
    ...state,
    failures,
    firstFailureAt,
    lastReason: reason,
    scannedAtFailure: state.scanned,
    halt: held ? haltFor(reason, recovery) : state.halt,
  };
}

/** Fold the scanned block count from a status read. A rise after a failure ends the run. */
export function recordScanned(state: SyncFailureState, scanned: number): SyncFailureState {
  const progressed = state.failures > 0 && scanned > state.scannedAtFailure;
  return progressed ? endRun({ ...state, scanned }) : { ...state, scanned };
}

/** A session that finished without failing ends the run. */
export const recordSessionCompleted = (state: SyncFailureState): SyncFailureState => endRun(state);

export const isSyncHalted = (state: SyncFailureState): boolean => state.halt.kind !== "none";

/** The sync line of the error banner, empty when there is nothing to say. */
export function deriveSyncBanner(state: SyncFailureState): string {
  switch (state.halt.kind) {
    case "walletNeedsRescan":
      return syncFailureMessage(state.halt.reason, "abort");
    case "serverCannotServe":
      return syncFailureMessage(state.halt.reason, "server_unavailable");
    case "none":
      return state.failures >= FAILURES_BEFORE_BANNER ? syncFailureMessage(state.lastReason) : "";
  }
}

/** The reason the server light shows, when the halt is about the server. */
export const deriveCannotServe = (state: SyncFailureState): string | null =>
  state.halt.kind === "serverCannotServe" ? state.halt.reason : null;

/** A new session, a new server or a rescan starts over. */
export const resetSyncFailures = (): SyncFailureState => INITIAL_SYNC_FAILURES;
