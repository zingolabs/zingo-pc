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

export function syncFailureMessage(reason: string): string {
  return isConnectionFailure(reason) ? "The server stopped answering — reconnecting." : reason;
}

export default syncFailureMessage;
