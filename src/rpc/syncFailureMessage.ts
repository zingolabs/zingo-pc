/**
 * What the sync banner says when a poll fails.
 *
 * The wallet's own words are kept for everything it knows about — a wallet
 * ahead of the chain, a corrupt file, a rejected transaction — because those
 * are facts about this wallet and no rewrite of ours improves them
 * (see `userFacingError`).
 *
 * A dropped connection is the exception. It arrives as every layer that
 * carried it:
 *
 *   sync: server error ← server request failed ← code: 'The operation was
 *   cancelled', message: "Timeout expired", source:
 *   tonic::transport::Error(Transport, TimeoutExpired(())) ← transport error
 *   ← Timeout expired
 *
 * Five clauses saying one thing: the server stopped answering. It says nothing
 * the user can act on, it is the commonest failure there is — it happens
 * whenever the machine sleeps or the window sits in the background long enough
 * for the connection to go stale — and the next poll opens a new connection
 * and carries on. So it gets one sentence that also says what the wallet is
 * doing about it.
 */

// Matched on the whole chain rather than its last clause: which layer speaks
// last depends on where the connection broke.
const CONNECTION_SIGNS: readonly RegExp[] = [
  /timeout expired/i,
  /transport error/i,
  /operation was cancelled/i,
  /error trying to connect/i,
  /connection (refused|reset|closed)/i,
  /dns error/i,
  /tcp connect error/i,
  /broken pipe/i,
  /unavailable/i,
];

export function isConnectionFailure(reason: string): boolean {
  return CONNECTION_SIGNS.some((sign) => sign.test(reason));
}

/**
 * zingolib's verdict on a failed sync, as it crosses the boundary.
 *
 * The library classifies every failure, and the classification is what this
 * app acts on: matching its prose would be guessing at what it already knows.
 */
export type SyncRecovery = "maybe_recoverable_server" | "server_unavailable" | "abort";

/**
 * Whether the server itself is the thing to change.
 *
 * zingolib's `ServerUnavailable` covers two different situations, because
 * `ServerError::RequestFailed` carries both: a server answering with data this
 * wallet cannot use — a missing pool, a protocol too old — and a request that
 * timed out. The first calls for a different server. The second is the
 * commonest failure there is, recovers by itself on the next attempt, and is
 * what a machine coming back from sleep or a window left unfocused produces.
 *
 * So the verdict alone is not enough to stop trying: the reason has to not
 * look like a connection that dropped.
 */
export function serverCannotServe(reason: string, recovery?: SyncRecovery): boolean {
  return recovery === "server_unavailable" && !isConnectionFailure(reason);
}

export function syncFailureMessage(reason: string, recovery?: SyncRecovery): string {
  // A server the wallet cannot sync from will not become one by being asked
  // again, and that is the whole of what the user needs to know: the cause
  // chain under it names a protocol value they did not choose and cannot set.
  // Kept as a second sentence because it is what they do next.
  if (serverCannotServe(reason, recovery)) {
    return "This server cannot serve this wallet. Switch to another server.";
  }
  return isConnectionFailure(reason) ? "The server stopped answering — reconnecting." : reason;
}

export default syncFailureMessage;
