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

export type ServerHealthLevel = "unknown" | "ok" | "slow" | "unstable" | "down" | "unusable";

// How many in a row it takes to call it, either way.
const RUN_TO_CALL_IT = 3;

/**
 * Past this, an answer counts as slow.
 *
 * Argued from measurement, which is what `lastDurationMs` was being kept for.
 * The eighteen servers this wallet would offer on mainnet answer this exact
 * probe in 64–483ms from a machine on a domestic connection, and the app's own
 * probe against its active server sits at 136–147ms. Two seconds is four times
 * the slowest of those and well under the fifteen the probe waits before
 * calling it dead, so it names the gap between "answering" and "usable"
 * without disputing either end.
 *
 * A number that only means anything once the caller is not the bottleneck.
 * While every native call shared four threads, a probe could be billed a
 * hundred seconds for a server answering in one tenth of one — and grading on
 * that would have blamed the server for our own queue.
 */
const SLOW_ANSWER_MS = 2_000;

export type ServerHealthState = {
  readonly probes: number;
  readonly consecutiveOk: number;
  readonly consecutiveFailures: number;
  // Answers that arrived, and took too long about it.
  readonly consecutiveSlow: number;
  readonly sawFailure: boolean;
  // Why the wallet cannot sync from this server, when the server is answering
  // perfectly well. The probe cannot see this: it asks for the latest block,
  // which a server missing a whole pool answers as readily as any other. It
  // comes from the sync engine's own verdict on the session it just lost.
  readonly cannotServe: string | null;
  // Round-trip of the last probe in ms, whatever its outcome. Kept so the
  // timeout can later be argued from measurements rather than from taste.
  readonly lastDurationMs: number | null;
};

export const INITIAL_SERVER_HEALTH: ServerHealthState = {
  probes: 0,
  consecutiveOk: 0,
  consecutiveFailures: 0,
  consecutiveSlow: 0,
  sawFailure: false,
  cannotServe: null,
  lastDurationMs: null,
};

/** Fold one probe outcome into the session state. */
export function recordProbe(
  state: ServerHealthState,
  answered: boolean,
  durationMs: number | null = null,
): ServerHealthState {
  // An unmeasured answer is not evidence of speed either way, so it leaves the
  // run where it was rather than clearing it.
  const slow = answered && durationMs !== null && durationMs > SLOW_ANSWER_MS;
  const measuredFast = answered && durationMs !== null && durationMs <= SLOW_ANSWER_MS;
  return {
    probes: state.probes + 1,
    consecutiveOk: answered ? state.consecutiveOk + 1 : 0,
    consecutiveFailures: answered ? 0 : state.consecutiveFailures + 1,
    consecutiveSlow: slow ? state.consecutiveSlow + 1 : measuredFast ? 0 : state.consecutiveSlow,
    sawFailure: state.sawFailure || !answered,
    // A probe says nothing either way about whether the server can serve this
    // wallet: it is the same question answered the same way before and after.
    cannotServe: state.cannotServe,
    lastDurationMs: durationMs,
  };
}

/**
 * Records that sync cannot run against this server, with the reason.
 *
 * Kept apart from the probe run because it is a different kind of fact. A
 * server that does not serve a pool this wallet needs answers every probe and
 * will go on answering them: no number of them will ever call it down, and the
 * wallet meanwhile does not advance a block. Passing `null` clears it, which
 * is what a session that syncs does.
 */
export function recordCannotServe(state: ServerHealthState, reason: string | null): ServerHealthState {
  return { ...state, cannotServe: reason };
}

/**
 * The light to show.
 *
 * A session that has never failed is green from its first answer: making the
 * user wait three probes to see green on a healthy server would just teach them
 * the light means nothing. The three-in-a-row rule is what governs recovery,
 * so a server that misbehaved has to prove itself before the light clears.
 *
 * Slowness is its own verdict, below silence and above health. A server taking
 * seconds to answer is not down — it answers — and calling it healthy is how a
 * green light sat over a wallet that would not move. It takes the same three in
 * a row as everything else here: one slow answer is a moment, three is the
 * server.
 */
export function deriveServerHealth(state: ServerHealthState): ServerHealthLevel {
  // Above everything, including silence: a server that answers but cannot
  // serve this wallet is not going to be redeemed by the next three probes,
  // and the remedy is a different server rather than patience.
  if (state.cannotServe) {
    return "unusable";
  }
  if (state.probes === 0) {
    return "unknown";
  }
  if (state.consecutiveFailures >= RUN_TO_CALL_IT) {
    return "down";
  }
  // Ranked under failure: a server doing both is described by the worse one.
  if (state.consecutiveSlow >= RUN_TO_CALL_IT) {
    return "slow";
  }
  if (!state.sawFailure) {
    return state.consecutiveOk > 0 ? "ok" : "unknown";
  }
  return state.consecutiveOk >= RUN_TO_CALL_IT ? "ok" : "unstable";
}

/** A switch of active server starts the count over; the old one's record says nothing about the new one. */
export const resetServerHealth = (): ServerHealthState => INITIAL_SERVER_HEALTH;
