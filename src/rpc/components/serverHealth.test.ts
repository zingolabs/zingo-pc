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

// A server that answers in seconds is not down — it answers — and calling that
// healthy is how a green light sat over a wallet that would not move.
describe("slow answers", () => {
  const fold = (probes: Array<[boolean, number | null]>) =>
    probes.reduce((state, [answered, ms]) => recordProbe(state, answered, ms), INITIAL_SERVER_HEALTH);

  it("stays green while answers are quick", () => {
    expect(
      deriveServerHealth(
        fold([
          [true, 140],
          [true, 150],
          [true, 136],
        ]),
      ),
    ).toBe("ok");
  });

  // Same three-in-a-row rule as everything else here: one slow answer is a
  // moment, three is the server.
  it("takes three slow answers to say so", () => {
    expect(
      deriveServerHealth(
        fold([
          [true, 8000],
          [true, 8000],
        ]),
      ),
    ).toBe("ok");
    expect(
      deriveServerHealth(
        fold([
          [true, 8000],
          [true, 8000],
          [true, 8000],
        ]),
      ),
    ).toBe("slow");
  });

  it("clears as soon as one answer is quick again", () => {
    const state = fold([
      [true, 8000],
      [true, 8000],
      [true, 8000],
      [true, 140],
    ]);
    expect(deriveServerHealth(state)).toBe("ok");
  });

  // Silence outranks slowness: a server doing both is described by the worse.
  it("reports down rather than slow when it stops answering", () => {
    const state = fold([
      [true, 8000],
      [true, 8000],
      [true, 8000],
      [false, null],
      [false, null],
      [false, null],
    ]);
    expect(deriveServerHealth(state)).toBe("down");
  });

  // An answer nobody timed is not evidence of speed, so it leaves the run
  // where it was rather than clearing it.
  it("does not treat an unmeasured answer as a fast one", () => {
    const state = fold([
      [true, 8000],
      [true, 8000],
      [true, null],
      [true, 8000],
    ]);
    expect(deriveServerHealth(state)).toBe("slow");
  });
});
