// How long one draw of exits gets to prove itself before main draws again. Pure, so
// a test can drive the decision without a proxy; the policy is zingo-mobile's
// MixnetCoordinator, whose field logs are where the numbers come from.
//
// The wallet's readiness gate retries the probe, never the draw: a draw that never
// answers costs its full budget, about a minute, on the same gateway and exit.
// Mobile's logs (2026-09-24) show roughly half the draws never answering at all. A
// healthy one listens in ~6s and is proven ~1s later, and redrawing costs one birth.

const BOOTSTRAP_DEADLINE_MS = 20_000;

// An attach gets this long however late it started: a wallet that opened after the
// proxy came up has not had the deadline's worth of time. Above the tails that
// intermittently blow a 15s bound on a healthy draw.
const ATTACH_GRACE_MS = 15_000;

// Three bad draws is where luck stops being the explanation. Past this the last draw
// runs into the wallet's own gate and the ordinary backoff takes it from there.
const BOOTSTRAP_REDRAW_LIMIT = 3;

/**
 * What to do when a draw's deadline fires.
 *
 * @returns "wait" to look again later, "settled" when there is nothing left to do,
 *          or "redraw" to replace the proxy with a fresh draw.
 */
function drawVerdict({ hasAddress, walletMode, attachAgeMs, redrawsSpent }) {
  // The proxy is on its own bounded clock until it listens, and redrawing here would
  // kill the very bootstrap still under way. Nothing is lost by waiting: one that
  // never lands exits and takes the reconnect path.
  if (!hasAddress) return "wait";
  if (walletMode === "ready" || walletMode === "previously_proven_this_epoch") return "settled";
  // A verdict already, and the reconnect path owns it.
  if (walletMode === "died" || walletMode === "switched_off") return "settled";
  // No wallet has been offered this draw yet, or only just now.
  if (attachAgeMs === null || attachAgeMs < ATTACH_GRACE_MS) return "wait";
  return redrawsSpent >= BOOTSTRAP_REDRAW_LIMIT ? "settled" : "redraw";
}

module.exports = { ATTACH_GRACE_MS, BOOTSTRAP_DEADLINE_MS, BOOTSTRAP_REDRAW_LIMIT, drawVerdict };
