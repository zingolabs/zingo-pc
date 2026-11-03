import { RPCDeathReport, RPCMixnetStatusType } from "./RPCMixnetStatusType";
import { describeMixnetDeath } from "./mixnetPresenter";

// What main reports for the Nym doctor (public/electron.js, `mixnet:doctor-state`
// and `mixnet:doctor-run`). Everything here is read and rendered; nothing decides
// a route, which stays with mixnetPresenter and the wallet core.

export type DoctorJournalEntry = {
  at: number;
  level: "info" | "warn" | "error";
  source: string;
  text: string;
};

export type DoctorAttempt = {
  at: number;
  host: string;
  route: string;
  kind: string;
  millis: number;
  failure: string | null;
  fault_domain: string | null;
};

// The wallet's side, null with no wallet open.
export type DoctorSession = {
  transmit_policy: string;
  indexer: string | null;
  default_indexer: string | null;
  attach_budget_ms: number;
  round_trip_bound_ms: number;
  attempts: DoctorAttempt[];
};

export type DoctorState = {
  at: number;
  app: string;
  platform: string;
  online: boolean;
  intent: string;
  phase: string;
  retrying: boolean;
  nextRetryMs: number | null;
  narration: string | null;
  status: RPCMixnetStatusType;
  wallet: RPCMixnetStatusType | null;
  proxy: {
    path: string;
    // Null when only spawning could tell: a bare name on PATH in a dev run.
    exists: boolean | null;
    size?: number;
    pid: number | null;
    running: boolean;
    socks5Addr: string | null;
    exits: string[];
  };
  stats: {
    bootstraps: number;
    proxyExits: number;
    attachesFailed: number;
    walletDeaths: number;
    restarts: number;
    redraws: number;
    reconnectsScheduled: number;
    timesReady: number;
    lossTimes: number[];
    lastBootstrapMs: number | null;
    lastAttachMs: number | null;
    lastReadyAt: number | null;
    lastStderr: string | null;
    lastExit: { at: number; code: number | null; signal: string | null } | null;
  };
  session: DoctorSession | null;
  // What the run in flight has measured so far, null with none running.
  doctorProgress: DoctorLegs | null;
  journal: DoctorJournalEntry[];
};

type Skipped = { skipped: string };
type NativeError = { error: string };
type NetFailure = { stage: string; target: string; cause_chain: string[] };

export type DoctorDirectory = { ok: boolean; exitCount: number; millis: number; error?: string };
export type DoctorDial = { ok: boolean; millis: number; error?: string };
export type DoctorTunnel = {
  ok: boolean;
  millis: number;
  target: string;
  stages: { step: string; millis: number; ok: boolean }[];
  error?: string;
};
export type DoctorWalletLeg = {
  host: string;
  millis: number;
  chain?: string;
  height?: number;
  failure?: NetFailure;
};
export type DoctorDirect = {
  server: string;
  stages: { step: string; millis: number; failure: NetFailure | null }[];
  chain: string | null;
  height: number | null;
};

export type DoctorRun = {
  startedAt: number;
  millis: number;
  directory: DoctorDirectory;
  listener: DoctorDial | Skipped;
  tunnelServer: DoctorTunnel | Skipped;
  tunnelControl: DoctorTunnel | Skipped;
  walletProbe: DoctorWalletLeg[] | NativeError | Skipped;
  direct: DoctorDirect | NativeError | Skipped;
};

export type DoctorRowState = "ok" | "fail" | "skip";
export type DoctorRow = { label: string; state: DoctorRowState; value: string };

const failureText = (failure: NetFailure) => `${failure.stage} — ${failure.cause_chain.join(" ← ") || failure.target}`;

const isSkipped = (leg: object): leg is Skipped => "skipped" in leg;
const isNativeError = (leg: object): leg is NativeError => "error" in leg && !("ok" in leg);

function directoryRow(leg: DoctorDirectory): DoctorRow {
  return leg.ok
    ? { label: "Nym directory", state: "ok", value: `${leg.exitCount} exits listed, ${leg.millis} ms` }
    : { label: "Nym directory", state: "fail", value: leg.error ?? `failed after ${leg.millis} ms` };
}

function listenerRow(leg: DoctorRun["listener"]): DoctorRow {
  const label = "Local proxy";
  if (isSkipped(leg)) return { label, state: "skip", value: leg.skipped };
  return leg.ok
    ? { label, state: "ok", value: `answers SOCKS5, ${leg.millis} ms` }
    : { label, state: "fail", value: leg.error ?? "no answer" };
}

function tunnelRow(label: string, leg: DoctorTunnel | Skipped): DoctorRow {
  if (isSkipped(leg)) return { label, state: "skip", value: leg.skipped };
  if (leg.ok) return { label, state: "ok", value: `${leg.target} answered through the tunnel, ${leg.millis} ms` };
  const reached = leg.stages[leg.stages.length - 1]?.step;
  return { label, state: "fail", value: `${leg.target}, at ${reached ?? "start"}: ${leg.error ?? "failed"}` };
}

function walletRow(leg: DoctorRun["walletProbe"]): DoctorRow {
  const label = "Wallet round trip";
  if (isSkipped(leg)) return { label, state: "skip", value: leg.skipped };
  // The wallet refuses this while the mixnet is not ready. That is its answer and
  // not a measurement, so it does not count against the tunnel.
  if (isNativeError(leg)) return { label, state: "skip", value: leg.error };
  const first = leg[0];
  if (!first) return { label, state: "skip", value: "nothing to probe" };
  return first.failure
    ? { label, state: "fail", value: failureText(first.failure) }
    : { label, state: "ok", value: `height ${first.height} on ${first.chain}, ${first.millis} ms` };
}

function directRow(leg: DoctorRun["direct"]): DoctorRow {
  const label = "Direct to the server";
  if (isSkipped(leg)) return { label, state: "skip", value: leg.skipped };
  if (isNativeError(leg)) return { label, state: "fail", value: leg.error };
  const failed = leg.stages.find((stage) => stage.failure);
  if (failed?.failure) return { label, state: "fail", value: `${failed.step}: ${failureText(failed.failure)}` };
  const timings = leg.stages.map((stage) => `${stage.step} ${stage.millis} ms`).join(", ");
  return { label, state: "ok", value: `${leg.server} at height ${leg.height}, ${timings}` };
}

export function doctorRows(run: DoctorRun): DoctorRow[] {
  return [
    directoryRow(run.directory),
    listenerRow(run.listener),
    tunnelRow("Tunnel to the server", run.tunnelServer),
    tunnelRow("Tunnel to a control", run.tunnelControl),
    walletRow(run.walletProbe),
    directRow(run.direct),
  ];
}

export type DoctorTone = "ok" | "warn" | "bad" | "neutral";
// What the screen offers to do about it: choosing a server, or replacing the proxy.
export type DoctorAction = "server" | "restart";
export type DoctorVerdict = { tone: DoctorTone; headline: string; detail?: string; action?: DoctorAction };

// The window that separates a transport that keeps failing from one that failed
// once, and the count that makes it a pattern. The backoff reaches its 60s ceiling
// by the fifth attempt, so three inside ten minutes is not a single bad moment.
const FLAPPING_WINDOW_MS = 10 * 60 * 1000;
const FLAPPING_LOSSES = 3;

export const recentLosses = (state: DoctorState) =>
  state.stats.lossTimes.filter((at) => state.at - at <= FLAPPING_WINDOW_MS).length;

// The latest thing anything said about why. The wallet's typed cause goes first,
// since it is the one that names a stage.
export function lastCause(state: DoctorState): string | null {
  const death: RPCDeathReport | null = state.status.death ?? state.wallet?.death ?? null;
  return describeMixnetDeath(death) ?? state.stats.lastStderr;
}

const WHERE_IT_BREAKS = "Run diagnostics to find out where it breaks.";

// What can be said from what is already known, without touching the network.
function passiveVerdict(state: DoctorState): DoctorVerdict {
  if (state.status.mode === "switched_off") {
    return {
      tone: "neutral",
      headline: "Off for this session",
      detail: "Your sends travel over clearnet, so your server sees your IP.",
    };
  }
  if (state.proxy.exists === false) {
    return {
      tone: "bad",
      headline: "The mixnet component is missing",
      detail: `nym-proxy is not at ${state.proxy.path}. Security software may have removed it; reinstalling restores it.`,
    };
  }
  if (state.session && !state.session.indexer) {
    return {
      tone: "bad",
      headline: "No server selected",
      detail: "The mixnet needs a server to connect to.",
      action: "server",
    };
  }
  const losses = recentLosses(state);
  if (losses >= FLAPPING_LOSSES) {
    return {
      tone: "bad",
      headline: "The mixnet keeps disconnecting",
      detail: `Lost ${losses} times in the last 10 minutes. ${WHERE_IT_BREAKS}`,
    };
  }
  switch (state.status.mode) {
    case "ready":
      return { tone: "ok", headline: "Connected", detail: "Your sends travel over the Nym mixnet." };
    case "bootstrapping":
      return state.retrying
        ? { tone: "warn", headline: "Can't reach the mixnet yet", detail: `Still trying. ${WHERE_IT_BREAKS}` }
        : { tone: "neutral", headline: "Connecting…", detail: state.narration ?? undefined };
    case "died":
      return {
        tone: "bad",
        headline: "Connection to the mixnet was lost",
        detail: `It keeps trying by itself. ${WHERE_IT_BREAKS}`,
      };
    default:
      return { tone: "bad", headline: "Not connected", detail: WHERE_IT_BREAKS };
  }
}

const passed = (leg: object) => "ok" in leg && (leg as { ok: boolean }).ok;
const measuredFailure = (leg: object) => "ok" in leg && !(leg as { ok: boolean }).ok;

// Which layer broke, walking outward from this machine. The first answer wins
// because each layer rests on the ones before it, and a failure further out says
// nothing while a nearer one is down.
export function diagnose(state: DoctorState, run: DoctorRun | null): DoctorVerdict {
  const passive = passiveVerdict(state);
  if (!run || state.status.mode === "switched_off" || state.proxy.exists === false) return passive;
  if (state.session && !state.session.indexer) return passive;

  const directFailed = directRow(run.direct).state === "fail";

  if (!run.directory.ok && directFailed) {
    return {
      tone: "bad",
      headline: "This computer can't reach the internet",
      detail: "Neither Nym nor your server answers. Check your network, VPN and security software.",
    };
  }
  if (!run.directory.ok) {
    return {
      tone: "bad",
      headline: "Can't reach the Nym network",
      detail:
        "Your internet works, but something is blocking Nym or its service is down. Check your VPN and security software.",
    };
  }
  if (measuredFailure(run.listener)) {
    return {
      tone: "bad",
      headline: "The mixnet stopped responding on this computer",
      detail: "Restarting the connection replaces it.",
      action: "restart",
    };
  }
  if (isSkipped(run.tunnelServer)) {
    return {
      tone: "warn",
      headline: "The mixnet hasn't connected yet",
      detail: "Nym answers, but no route through it has come up so far.",
    };
  }
  if (measuredFailure(run.tunnelServer) && passed(run.tunnelControl)) {
    return {
      tone: "bad",
      headline: "Your server can't be reached through the mixnet",
      detail: directFailed
        ? "The mixnet itself works, but your server isn't answering at all."
        : "The mixnet itself works, and your server answers directly but not through the mixnet.",
      action: "server",
    };
  }
  // No second server to compare against: the selected one is the control.
  if (measuredFailure(run.tunnelServer) && isSkipped(run.tunnelControl)) {
    return directFailed
      ? {
          tone: "bad",
          headline: "Your server isn't answering",
          detail: "It doesn't answer directly either, so it is most likely down.",
          action: "server",
        }
      : {
          tone: "bad",
          headline: "The mixnet isn't carrying data",
          detail:
            "Your server answers directly, so the fault is this route through Nym. Restarting tries different ones.",
          action: "restart",
        };
  }
  if (measuredFailure(run.tunnelServer)) {
    return {
      tone: "bad",
      headline: "The mixnet isn't carrying data",
      detail: "Restarting the connection tries different routes through Nym.",
      action: "restart",
    };
  }
  // The handshake got through and the wallet's own request did not, so the fault
  // is above the transport: the server's gRPC, or a stream the exit cut short.
  if (walletRow(run.walletProbe).state === "fail") {
    return {
      tone: "warn",
      headline: "Your server isn't answering the wallet through the mixnet",
      detail: "The connection reaches it, but its reply failed. Try again, or choose another server.",
      action: "server",
    };
  }
  if (directFailed) {
    return {
      tone: "warn",
      headline: "Your server doesn't answer directly",
      detail: "Sends work over the mixnet, but syncing goes direct and won't. Something may be blocking this server.",
      action: "server",
    };
  }
  const losses = recentLosses(state);
  if (losses > 0) {
    return {
      tone: "warn",
      headline: "Working now, but it disconnected recently",
      detail: `Lost ${losses} ${losses === 1 ? "time" : "times"} in the last 10 minutes.`,
    };
  }
  return { tone: "ok", headline: "Everything is working" };
}

export type DoctorStepState = "ok" | "fail" | "running" | "unchecked";
export type DoctorStep = { label: string; state: DoctorStepState };

// The legs as they arrive from main: one still running is simply absent.
export type DoctorLegs = Partial<Omit<DoctorRun, "startedAt" | "millis">>;

type LegState = DoctorRowState | "pending";

// The six measurements as the four questions a user has. Each answer is taken as
// soon as the legs that settle it are in, so the list moves while slow legs run. A
// step past the first failure rests on something broken, so it reads as not checked
// whatever its own legs said.
export function doctorSteps(state: DoctorState, legs: DoctorLegs): DoctorStep[] {
  const of = <T>(leg: T | undefined, row: (leg: T) => DoctorRow): LegState => (leg ? row(leg).state : "pending");
  const nym = of(legs.directory, directoryRow);
  const direct = of(legs.direct, directRow);
  const local = of(legs.listener, listenerRow);
  const server = of(legs.tunnelServer, (leg) => tunnelRow("", leg));
  const control = of(legs.tunnelControl, (leg) => tunnelRow("", leg));
  const wallet = of(legs.walletProbe, walletRow);

  const connection = (): DoctorStepState => {
    if (nym === "ok" || direct === "ok") return "ok";
    if (nym === "pending" || direct === "pending") return "running";
    return nym === "fail" && direct === "fail" ? "fail" : "unchecked";
  };
  const tunnel = (): DoctorStepState => {
    if (local === "fail") return "fail";
    if (server === "ok" || control === "ok") return "ok";
    if (local === "skip") return "unchecked";
    if (local === "pending" || server === "pending" || control === "pending") return "running";
    if (control === "fail") return "fail";
    if (server !== "fail") return "unchecked";
    // The server is its own control: its failure blames the tunnel only if the
    // server answers without it.
    if (direct === "pending") return "running";
    return direct === "fail" ? "unchecked" : "fail";
  };
  const reachesServer = (): DoctorStepState => {
    if (server === "fail" || wallet === "fail" || direct === "fail") return "fail";
    if (server === "pending" || wallet === "pending" || direct === "pending") return "running";
    return server === "ok" ? "ok" : "unchecked";
  };

  let broken = false;
  return (
    [
      ["Your internet connection", connection()],
      ["Nym network", nym === "pending" ? "running" : nym === "ok" ? "ok" : "fail"],
      ["Mixnet tunnel", tunnel()],
      ["Your server", reachesServer()],
    ] as [string, DoctorStepState][]
  ).map(([label, answer]) => {
    const step: DoctorStep = { label, state: broken ? "unchecked" : answer };
    if (answer === "fail") broken = true;
    return step;
  });
}

// One line per host and route, the shape of zingo-cli's `network history`.
export function historyLines(attempts: DoctorAttempt[]): string[] {
  const grouped = new Map<string, DoctorAttempt[]>();
  for (const attempt of attempts) {
    const key = `${attempt.host} over ${attempt.route.toLowerCase()}`;
    grouped.set(key, [...(grouped.get(key) ?? []), attempt]);
  }
  return [...grouped.entries()].map(([key, group]) => {
    const ok = group.filter((attempt) => !attempt.failure).length;
    const last = group[group.length - 1];
    const ending = last.failure ? `last failed: ${last.failure}` : `last ok in ${last.millis} ms`;
    return `${key}: ${ok}/${group.length} ok, ${ending}`;
  });
}

const stamp = (at: number) => new Date(at).toISOString();

export const journalLine = (entry: DoctorJournalEntry) =>
  `${stamp(entry.at)} ${entry.level.toUpperCase().padEnd(5)} ${entry.source}: ${entry.text}`;

// The same first line mobile's report starts with, so a support reply can key on
// it whichever app it came from. Untranslated and stable: it is meant for pasting.
export const DOCTOR_HEADLINE = "zingo mixnet doctor report";

// No keys, addresses or balances are anywhere in this: only servers, exits, times
// and errors. It is still the record of when this wallet was active, which is why
// it goes nowhere unless the user pastes it somewhere.
export function doctorReport(state: DoctorState, run: DoctorRun | null): string {
  const verdict = diagnose(state, run);
  const { stats, proxy, session } = state;
  const lines = [
    `## ${DOCTOR_HEADLINE}`,
    `- taken: ${stamp(state.at)}`,
    `- verdict: ${verdict.headline}${verdict.detail ? ` ${verdict.detail}` : ""}`,
    `- app: ${state.app} on ${state.platform}, online ${state.online}`,
    `- server: ${session?.indexer ?? "no wallet open"}`,
    `- send route: ${session?.transmit_policy ?? "unknown"}`,
    `- status: ${state.status.mode}, phase ${state.phase}, wallet ${state.wallet?.mode ?? "unread"}, intent ${state.intent}`,
    `- proxy: pid ${proxy.pid ?? "none"}, binary ${proxy.exists === false ? "MISSING" : `${proxy.size ?? "?"} bytes`} at ${proxy.path}`,
    `- bound exits: ${proxy.exits.join(", ") || "none"}`,
    `- counts: ${stats.bootstraps} bootstraps, ${stats.timesReady} ready, ${stats.proxyExits} proxy exits, ${stats.attachesFailed} attaches refused, ${stats.walletDeaths} wallet deaths, ${stats.restarts} restarts, ${stats.redraws} redraws, ${stats.reconnectsScheduled} retries, ${recentLosses(state)} losses in 10 min`,
    `- last bootstrap ${stats.lastBootstrapMs ?? "?"} ms, last attach proven in ${stats.lastAttachMs ?? "?"} ms of a ${session?.attach_budget_ms ?? "?"} ms budget`,
  ];
  const cause = lastCause(state);
  if (cause) lines.push(`- last cause: ${cause}`);
  if (run) {
    lines.push("", `### diagnostics (${run.millis} ms, ${stamp(run.startedAt)})`);
    for (const row of doctorRows(run)) lines.push(`- ${row.label}: ${row.state.toUpperCase()} — ${row.value}`);
  }
  if (session?.attempts.length) {
    lines.push("", "### this session's attempts", ...historyLines(session.attempts).map((line) => `- ${line}`));
  }
  lines.push("", "### journal", "```", ...state.journal.map(journalLine), "```");
  return lines.join("\n");
}
