import { RPCMixnetStatusType } from "./RPCMixnetStatusType";

// What the user can do about the current mixnet state: nothing, wait for the
// bootstrap, or re-enable a lost or disabled transport.
export type MixnetRecoveryAction = "none" | "wait" | "reenable";

// The screen-facing projection of Mixnet Mode. `statusKey` is a stable token
// (never display text); `socks5Addr` is set only while ready; `narration` is
// the live bootstrap line when one exists; `sendBlocked` is the fail-closed
// verdict a send screen must respect, true in every state except `ready` and
// the deliberate `switched_off`; `recovery` is the user's next move.
export type MixnetView = {
  readonly statusKey: string;
  readonly socks5Addr: string | null;
  readonly narration: string | null;
  readonly sendBlocked: boolean;
  readonly recovery: MixnetRecoveryAction;
};

// The fail-closed view for when the status read itself fails (an uninitialized
// client, a native throw). An unknowable transport is never consented
// clearnet, so sends stay blocked and the user's move is to re-enable.
export const UNKNOWN_MIXNET_VIEW: MixnetView = {
  statusKey: "mixnet.status.unknown",
  socks5Addr: null,
  narration: null,
  sendBlocked: true,
  recovery: "reenable",
};

// Projects the wire status to the screen view. Pure: the fail-closed invariant
// lives here in UI form (the wallet core enforces the same rule on the route;
// this projection only keeps the UI honest about it). Only `ready` and the
// deliberate per-session `switched_off` leave sends unblocked; `unattached`,
// `bootstrapping`, and `died` all refuse, because absence or loss of the
// transport is never consent to clearnet.
export function deriveMixnetView(status: RPCMixnetStatusType): MixnetView {
  switch (status.mode) {
    case "unattached":
      return {
        statusKey: "mixnet.status.unattached",
        socks5Addr: null,
        narration: null,
        sendBlocked: true,
        recovery: "reenable",
      };
    case "switched_off":
      return {
        statusKey: "mixnet.status.off",
        socks5Addr: null,
        narration: null,
        sendBlocked: false,
        recovery: "reenable",
      };
    case "bootstrapping":
      return {
        statusKey: "mixnet.status.bootstrapping",
        socks5Addr: null,
        narration: status.bootstrap_detail || null,
        sendBlocked: true,
        recovery: "wait",
      };
    case "ready":
      return {
        statusKey: "mixnet.status.ready",
        socks5Addr: status.socks5_addr || null,
        narration: null,
        sendBlocked: false,
        recovery: "none",
      };
    case "died":
      return {
        statusKey: "mixnet.status.died",
        socks5Addr: null,
        narration: null,
        sendBlocked: true,
        recovery: "reenable",
      };
  }
}

/**
 * How the next send will travel, said plainly before the user commits to it.
 *
 * There are two working routes, not one. zingolib's route resolver takes the
 * mixnet tunnel when it is ready, and clearnet through the configured indexer
 * when the user has switched the mixnet off for the session — the opt-out costs
 * privacy, not the ability to send. Only the states nobody consented to
 * (bootstrapping, unattached, died) refuse, and they refuse in the wallet core,
 * so the wait is a fact about the send and not a UI precaution.
 *
 * Stated for every state, including the good ones: a route that is only ever
 * mentioned when something is wrong teaches the user nothing about the route.
 */
export function describeSendRoute(view: MixnetView): string {
  switch (view.statusKey) {
    case "mixnet.status.ready":
      return "This send will travel over the Nym mixnet.";
    case "mixnet.status.off":
      return "This send will travel over clearnet — the Nym mixnet is off for this session.";
    case "mixnet.status.bootstrapping":
      return `Sending waits for the Nym mixnet to finish connecting${view.narration ? ` (${view.narration})` : ""}.`;
    default:
      return "Sending waits for the Nym mixnet. Re-enable it from Settings, or switch it off to send over clearnet.";
  }
}
