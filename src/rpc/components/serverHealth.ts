// Session health of the active server, folded from the outcome of a periodic
// latest-block probe against that server's URI.
//
// The probe is deliberately the direct one (`get_latest_block_server`), which
// opens its own connection to the URI instead of going through the open wallet.
// That is what makes this signal separable from the mixnet indicator: a dead
// tunnel does not colour the server red, and a dead server does not read as a
// transport fault. Each says one thing.
//
// Nothing here decides anything. A red light is a fact about the last three
// probes, and the user decides what to do about it — which is the whole reason
// this replaced trying to tell a server failure from a zingolib failure by
// reading error strings.

export type ServerHealthLevel = "unknown" | "ok" | "unstable" | "down";

// How many in a row it takes to call it, either way.
const RUN_TO_CALL_IT = 3;

export type ServerHealthState = {
  readonly probes: number;
  readonly consecutiveOk: number;
  readonly consecutiveFailures: number;
  readonly sawFailure: boolean;
  // Round-trip of the last probe in ms, whatever its outcome. Kept so the
  // timeout can later be argued from measurements rather than from taste.
  readonly lastDurationMs: number | null;
};

export const INITIAL_SERVER_HEALTH: ServerHealthState = {
  probes: 0,
  consecutiveOk: 0,
  consecutiveFailures: 0,
  sawFailure: false,
  lastDurationMs: null,
};

/** Fold one probe outcome into the session state. */
export function recordProbe(
  state: ServerHealthState,
  answered: boolean,
  durationMs: number | null = null,
): ServerHealthState {
  return {
    probes: state.probes + 1,
    consecutiveOk: answered ? state.consecutiveOk + 1 : 0,
    consecutiveFailures: answered ? 0 : state.consecutiveFailures + 1,
    sawFailure: state.sawFailure || !answered,
    lastDurationMs: durationMs,
  };
}

/**
 * The light to show.
 *
 * A session that has never failed is green from its first answer: making the
 * user wait three probes to see green on a healthy server would just teach them
 * the light means nothing. The three-in-a-row rule is what governs recovery,
 * so a server that misbehaved has to prove itself before the light clears.
 */
export function deriveServerHealth(state: ServerHealthState): ServerHealthLevel {
  if (state.probes === 0) {
    return "unknown";
  }
  if (state.consecutiveFailures >= RUN_TO_CALL_IT) {
    return "down";
  }
  if (!state.sawFailure) {
    return state.consecutiveOk > 0 ? "ok" : "unknown";
  }
  return state.consecutiveOk >= RUN_TO_CALL_IT ? "ok" : "unstable";
}

/** A switch of active server starts the count over; the old one's record says nothing about the new one. */
export const resetServerHealth = (): ServerHealthState => INITIAL_SERVER_HEALTH;
