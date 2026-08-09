import { INITIAL_SERVER_HEALTH, ServerHealthState, deriveServerHealth, recordProbe } from "./serverHealth";

const fold = (outcomes: boolean[]): ServerHealthState =>
  outcomes.reduce((state, answered) => recordProbe(state, answered), INITIAL_SERVER_HEALTH);

const levelAfter = (outcomes: boolean[]) => deriveServerHealth(fold(outcomes));

test("nothing probed yet is not a verdict", () => {
  expect(levelAfter([])).toBe("unknown");
});

test("a session that has never failed is green from its first answer", () => {
  expect(levelAfter([true])).toBe("ok");
});

test("one failure is not enough to call it down", () => {
  expect(levelAfter([true, false])).toBe("unstable");
  expect(levelAfter([true, false, false])).toBe("unstable");
});

test("three failures in a row is down", () => {
  expect(levelAfter([false, false, false])).toBe("down");
});

test("failures that are not consecutive stay amber", () => {
  expect(levelAfter([false, true, false, true, false, true])).toBe("unstable");
});

// The user's own transition: one answer takes it off red, but not straight to
// green — the server has to keep answering to clear the light.
test("a single answer lifts red to amber, not to green", () => {
  expect(levelAfter([false, false, false, true])).toBe("unstable");
  expect(levelAfter([false, false, false, true, true])).toBe("unstable");
});

test("three answers in a row clear a session that had failed", () => {
  expect(levelAfter([false, false, false, true, true, true])).toBe("ok");
});

test("a failure after recovery starts the run over", () => {
  expect(levelAfter([false, false, false, true, true, true, false, true, true])).toBe("unstable");
});

test("a probe carries its duration for later measurement", () => {
  expect(recordProbe(INITIAL_SERVER_HEALTH, true, 212).lastDurationMs).toBe(212);
  expect(recordProbe(INITIAL_SERVER_HEALTH, false, 30000).lastDurationMs).toBe(30000);
});

test("counts run in opposite directions", () => {
  const state = fold([true, true, false]);

  expect(state).toMatchObject({ probes: 3, consecutiveOk: 0, consecutiveFailures: 1, sawFailure: true });
});
