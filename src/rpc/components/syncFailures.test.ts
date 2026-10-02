import {
  INITIAL_SYNC_FAILURES,
  SyncFailureState,
  deriveCannotServe,
  deriveSyncBanner,
  isSyncHalted,
  recordScanned,
  recordSessionCompleted,
  recordSyncFailure,
} from "./syncFailures";
import { SyncRecovery } from "../syncFailureMessage";

const SECOND = 1000;

// Failures `secondsApart` from each other, the first at t = 0.
const failures = (
  count: number,
  recovery?: SyncRecovery,
  reason = "shard tree error",
  secondsApart = 30,
  from: SyncFailureState = INITIAL_SYNC_FAILURES,
): SyncFailureState =>
  Array.from({ length: count }).reduce<SyncFailureState>(
    (state, _, n) => recordSyncFailure(state, reason, recovery, n * secondsApart * SECOND),
    from,
  );

test("one failure does not halt, whatever the library calls it", () => {
  for (const recovery of ["server_unavailable", "abort", "maybe_recoverable_server", undefined] as const) {
    expect(isSyncHalted(failures(1, recovery))).toBe(false);
  }
});

test("six failures over two minutes halt", () => {
  // The sixth comes at 150s.
  expect(isSyncHalted(failures(6, "server_unavailable"))).toBe(true);
});

test("six failures inside two minutes do not halt", () => {
  expect(isSyncHalted(failures(6, "server_unavailable", "x", 10))).toBe(false);
});

test("failures over two minutes do not halt before the sixth", () => {
  expect(isSyncHalted(failures(5, "server_unavailable", "x", 60))).toBe(false);
});

test("the halt is about the wallet when the library says abort", () => {
  const state = failures(6, "abort", "shard tree error");
  expect(state.halt).toEqual({ kind: "walletNeedsRescan", reason: "shard tree error" });
  expect(deriveCannotServe(state)).toBeNull();
});

test("the halt is about the server otherwise", () => {
  for (const recovery of ["server_unavailable", "maybe_recoverable_server", undefined] as const) {
    const state = failures(6, recovery, "unavailable");
    expect(state.halt).toEqual({ kind: "serverCannotServe", reason: "unavailable" });
    expect(deriveCannotServe(state)).toBe("unavailable");
  }
});

test("blocks scanned after a failure start the run again", () => {
  let state = recordScanned(INITIAL_SYNC_FAILURES, 1000);
  for (let n = 0; n < 10; n += 1) {
    state = recordSyncFailure(state, "timeout", "maybe_recoverable_server", n * 30 * SECOND);
    state = recordScanned(state, 1000 + (n + 1) * 500);
  }
  expect(state.failures).toBe(0);
  expect(isSyncHalted(state)).toBe(false);
});

test("the same block count after a failure is no progress", () => {
  const state = recordScanned(failures(3, "abort", "x", 30, recordScanned(INITIAL_SYNC_FAILURES, 1000)), 1000);
  expect(state.failures).toBe(3);
});

test("a session that completes starts the run again", () => {
  expect(recordSessionCompleted(failures(5, "server_unavailable")).failures).toBe(0);
});

test("progress does not lift a halt", () => {
  const halted = failures(6, "abort");
  expect(isSyncHalted(recordScanned(halted, halted.scanned + 100))).toBe(true);
  expect(isSyncHalted(recordSessionCompleted(halted))).toBe(true);
});

test("the banner says nothing for a single failure", () => {
  expect(deriveSyncBanner(failures(1, "maybe_recoverable_server", "transport error ← Timeout expired"))).toBe("");
});

test("the banner says what happened from the second failure", () => {
  expect(deriveSyncBanner(failures(2, "maybe_recoverable_server", "transport error ← Timeout expired"))).toBe(
    "The server stopped answering — reconnecting.",
  );
});

test("the banner gives the remedy once halted", () => {
  expect(deriveSyncBanner(failures(6, "abort", "shard tree error"))).toBe(
    "Sync stopped: shard tree error. Rescan the wallet to recover.",
  );
  expect(deriveSyncBanner(failures(6, "server_unavailable", "unavailable"))).toBe(
    "This server cannot serve this wallet. Switch to another server.",
  );
});

test("the banner clears with the run", () => {
  expect(deriveSyncBanner(recordSessionCompleted(failures(3, "maybe_recoverable_server")))).toBe("");
});
