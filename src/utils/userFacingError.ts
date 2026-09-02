/**
 * The message worth putting in front of a user, out of what a failure looks
 * like by the time it has crossed the app.
 *
 * A refusal from the wallet arrives wearing every layer it passed through:
 *
 *   Error: Critical Error calculate send fee Error: Error invoking remote
 *   method 'native:get_spendable_balance_with_address': Error: Error: read:
 *   insufficient funds: 0 available of 10000 required
 *
 * Only the last clause is a fact about the user's money. Everything before it
 * is bookkeeping — worth keeping in the console, worth nothing on screen.
 *
 * Two layers are stripped, each for its own reason:
 *
 *   - Electron's IPC wrapper names the remote method it was invoking. That is
 *     an implementation detail of how the renderer reaches the wallet.
 *   - `Error: ` repeats because both sides add it. JavaScript prepends it when
 *     an Error is interpolated into a string, and zingolib's `ZingolibError`
 *     opens every one of its own variants with it too — a type that calls
 *     itself an error, next to a caller that says so again.
 * What is left alone is the wallet's own label for what it was doing —
 * `read:`, `sync:`, `rescan:`, `saving wallet:`. Judging them one by one only
 * produces a rule that holds for whichever one prompted it, so they all stay.
 *
 * Deliberately not a translation or a rewrite. The wallet's own words are the
 * accurate ones, and inventing friendlier prose here would put this file in
 * the business of restating facts it does not own.
 */

// Electron rethrows a handler's error with the channel it was invoking.
const IPC_WRAPPER = /^Error invoking remote method '[^']*':\s*/;

// Both JavaScript and `ZingolibError` add this, so it can appear several times
// over, and stripping one can expose the next.
const ERROR_PREFIX = /^Error:\s*/;

export function userFacingError(error: unknown): string {
  // `error.message` rather than `String(error)`: the latter is what puts the
  // first `Error: ` there in the first place.
  let message = error instanceof Error ? error.message : String(error ?? "");

  // Alternating, because the wrappers nest: an `Error: ` can hide an IPC
  // wrapper, which hides another `Error: `. Bounded so a message that somehow
  // consists only of prefixes cannot spin.
  for (let i = 0; i < 10; i += 1) {
    const shorter = message.replace(ERROR_PREFIX, "").replace(IPC_WRAPPER, "");
    if (shorter === message) break;
    message = shorter;
  }

  // Nothing left to show means the layers were the whole message. Say that
  // rather than render an empty line, which reads as no error at all.
  return message.trim() || "The wallet reported an error with no detail.";
}

export default userFacingError;
