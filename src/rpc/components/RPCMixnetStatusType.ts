// The Mixnet Mode status snapshot zingolib serializes across the neon boundary
// (ADR 0024, the zingolib-owned mixnet surface). This mirrors zingolib's
// nym::driver::MixnetStatus wire, pinned there by its wire_contract golden test
// and here by RPCMixnetStatusType.test.ts against the same bytes. Absent fields
// are omitted on the wire, so `mode` alone discriminates and each state carries
// only its own evidence.

// The five ratified Mixnet Mode tokens (zingolib MixnetMode, snake_case). Only
// `switched_off` consents to clearnet; the other four all refuse a mixnet-only
// send, so a consumer must treat them apart.
export type RPCMixnetMode = "unattached" | "switched_off" | "bootstrapping" | "ready" | "died";

// The stage a covered network operation failed at (zingo-net-diag NetOpStage).
// Unit stages are kebab tokens; a timeout also carries the bound it exceeded.
export type RPCNetOpStage =
  | "route-resolution"
  | "remote-connect"
  | "local-proxy-connect"
  | "socks-handshake"
  | "tunnel-transport"
  | "remote-tls"
  | "remote-http"
  | "payload-decode"
  | { "timed-out": { after_ms: number } };

// One typed failure record: the stage, the target it ran against, and the cause
// chain layered outermost-first, never joined into a single string.
export type RPCNetOpFailure = {
  stage: RPCNetOpStage;
  target: string;
  cause_chain: string[];
};

// A latched transport death: when it happened (milliseconds since the Unix
// epoch, a `new Date(at)`) and, when the watcher held one, the typed cause.
export type RPCDeathReport = {
  at: number;
  detail?: RPCNetOpFailure;
};

// socks5_addr is present exactly while `ready`, bootstrap_detail only while
// `bootstrapping`, death only while `died`.
export type RPCMixnetStatusType = {
  mode: RPCMixnetMode;
  socks5_addr?: string;
  bootstrap_detail?: string;
  death?: RPCDeathReport;
};
