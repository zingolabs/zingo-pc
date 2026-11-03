import {
  DOCTOR_HEADLINE,
  DoctorRun,
  DoctorState,
  diagnose,
  doctorReport,
  doctorRows,
  doctorSteps,
  historyLines,
  lastCause,
} from "./mixnetDoctor";

const NOW = 1_800_000_000_000;

const state = (overrides: Partial<DoctorState> = {}): DoctorState => ({
  at: NOW,
  app: "2.0.27",
  platform: "win32 10.0 x64",
  online: true,
  intent: "on",
  phase: "ready",
  retrying: false,
  nextRetryMs: null,
  narration: null,
  status: { mode: "ready", socks5_addr: "127.0.0.1:1" },
  wallet: { mode: "ready" },
  proxy: { path: "nym-proxy.exe", exists: true, size: 10, pid: 1, running: true, socks5Addr: "127.0.0.1:1", exits: [] },
  stats: {
    bootstraps: 1,
    proxyExits: 0,
    attachesFailed: 0,
    walletDeaths: 0,
    restarts: 0,
    redraws: 0,
    reconnectsScheduled: 0,
    timesReady: 1,
    lossTimes: [],
    lastBootstrapMs: 4000,
    lastAttachMs: 3000,
    lastReadyAt: NOW,
    lastStderr: null,
    lastExit: null,
  },
  session: {
    transmit_policy: "Mixnet",
    indexer: "https://custom.example:443/",
    default_indexer: "https://zec.rocks:443/",
    attach_budget_ms: 62000,
    round_trip_bound_ms: 30000,
    attempts: [],
  },
  doctorProgress: null,
  journal: [],
  ...overrides,
});

const tunnelOk = { ok: true, millis: 3000, target: "custom.example:443", stages: [] };
const tunnelFailed = {
  ok: false,
  millis: 30000,
  target: "custom.example:443",
  stages: [{ step: "tls", millis: 0, ok: false }],
  error: "no answer within 30s through the tunnel",
};
const directOk = {
  server: "custom.example",
  stages: [{ step: "grpc-info", millis: 40, failure: null }],
  chain: "main",
  height: 3_000_000,
};
const directFailed = {
  server: "custom.example",
  stages: [
    {
      step: "tcp-connect",
      millis: 20000,
      failure: { stage: "timed-out(20000ms)", target: "custom.example:443", cause_chain: ["no answer within 20s"] },
    },
  ],
  chain: null,
  height: null,
};

const run = (overrides: Partial<DoctorRun> = {}): DoctorRun => ({
  startedAt: NOW,
  millis: 5000,
  directory: { ok: true, exitCount: 872, millis: 1500 },
  listener: { ok: true, millis: 1 },
  tunnelServer: tunnelOk,
  tunnelControl: { ...tunnelOk, target: "zec.rocks:443" },
  walletProbe: [{ host: "custom.example", millis: 3000, chain: "main", height: 3_000_000 }],
  direct: directOk,
  ...overrides,
});

describe("diagnose, before anything is measured", () => {
  it("does not call a deliberate switch-off a fault", () => {
    const verdict = diagnose(state({ status: { mode: "switched_off" } }), null);
    expect(verdict.tone).toBe("neutral");
  });

  it("names a missing binary, and where it was expected", () => {
    const verdict = diagnose(state({ proxy: { ...state().proxy, exists: false } }), null);
    expect(verdict.tone).toBe("bad");
    expect(verdict.detail).toContain("nym-proxy.exe");
  });

  // A server on 9067 connected in the field, on the zingolib that proves readiness
  // against it. Whether a port works is for the measuring to say, never for this.
  it("does not judge a server by its port", () => {
    const session = { ...state().session!, indexer: "https://custom.example:9067/" };
    expect(diagnose(state({ session }), null).headline).toBe("Connected");
    expect(diagnose(state({ session }), run()).headline).toBe("Everything is working");
  });

  it("offers choosing a server when none is selected", () => {
    const session = { ...state().session!, indexer: null };
    expect(diagnose(state({ session }), null).action).toBe("server");
  });

  it("tells a transport that keeps failing from one that is merely down", () => {
    const lossTimes = [NOW - 60_000, NOW - 120_000, NOW - 180_000];
    const verdict = diagnose(
      state({ stats: { ...state().stats, lossTimes }, status: { mode: "bootstrapping" } }),
      null,
    );
    expect(verdict.headline).toBe("The mixnet keeps disconnecting");
    expect(verdict.detail).toContain("Lost 3 times");
  });

  // The losses are history by then, and the screen must not read as still broken.
  it("says connected once it is, whatever it lost on the way", () => {
    const lossTimes = [NOW - 60_000, NOW - 120_000, NOW - 180_000];
    const verdict = diagnose(state({ stats: { ...state().stats, lossTimes } }), null);
    expect(verdict.tone).toBe("ok");
    expect(verdict.headline).toBe("Connected");
    expect(verdict.detail).toContain("disconnected 3 times");
  });

  it("does not count losses from before the window", () => {
    const lossTimes = [NOW - 3_600_000, NOW - 3_500_000, NOW - 3_400_000];
    expect(diagnose(state({ stats: { ...state().stats, lossTimes } }), null).tone).toBe("ok");
  });
});

describe("diagnose, walking outward through the layers", () => {
  it("passes when every layer answers", () => {
    expect(diagnose(state(), run()).headline).toBe("Everything is working");
  });

  it("blames this machine when neither the directory nor the server answers", () => {
    const verdict = diagnose(
      state(),
      run({ directory: { ok: false, exitCount: 0, millis: 20000, error: "timeout" }, direct: directFailed }),
    );
    expect(verdict.headline).toBe("This computer can't reach the internet");
  });

  it("isolates Nym when the server still answers", () => {
    const verdict = diagnose(state(), run({ directory: { ok: false, exitCount: 0, millis: 20000, error: "boom" } }));
    expect(verdict.headline).toBe("Can't reach the Nym network");
  });

  it("offers a restart for a stuck local proxy", () => {
    const verdict = diagnose(state(), run({ listener: { ok: false, millis: 5000, error: "no answer" } }));
    expect(verdict.headline).toBe("The mixnet stopped responding on this computer");
    expect(verdict.action).toBe("restart");
  });

  // The control is what makes this one verdict and not two guesses.
  it("clears the mixnet when only the server fails through it, and offers another server", () => {
    const verdict = diagnose(state(), run({ tunnelServer: tunnelFailed }));
    expect(verdict.headline).toBe("Your server can't be reached through the mixnet");
    expect(verdict.detail).toContain("answers directly");
    expect(verdict.action).toBe("server");
  });

  it("says the server is not answering when it fails both ways", () => {
    const verdict = diagnose(state(), run({ tunnelServer: tunnelFailed, direct: directFailed }));
    expect(verdict.detail).toContain("isn't answering at all");
  });

  it("blames the tunnel when the control fails too, and offers a restart", () => {
    const verdict = diagnose(state(), run({ tunnelServer: tunnelFailed, tunnelControl: tunnelFailed }));
    expect(verdict.headline).toBe("The mixnet isn't carrying data");
    expect(verdict.action).toBe("restart");
  });

  // Without a control the tunnel cannot be cleared outright, so the direct leg decides.
  it("lets the direct leg decide when the server is its own control", () => {
    const noControl = { tunnelServer: tunnelFailed, tunnelControl: { skipped: "the server is the control" } };
    expect(diagnose(state(), run(noControl)).action).toBe("restart");
    expect(diagnose(state(), run({ ...noControl, direct: directFailed })).action).toBe("server");
  });

  it("tells the wallet's own request failing from the transport failing", () => {
    const verdict = diagnose(
      state(),
      run({
        walletProbe: [
          {
            host: "custom.example",
            millis: 20000,
            failure: { stage: "remote-http", target: "custom.example", cause_chain: ["status: Unavailable"] },
          },
        ],
      }),
    );
    expect(verdict.tone).toBe("warn");
    expect(verdict.headline).toBe("Your server isn't answering the wallet through the mixnet");
  });

  it("says the mixnet has not connected while the proxy has no address", () => {
    const verdict = diagnose(state(), run({ tunnelServer: { skipped: "no address" } }));
    expect(verdict.tone).toBe("warn");
    expect(verdict.headline).toBe("The mixnet hasn't connected yet");
  });

  it("still reports past losses when everything answers now", () => {
    const stats = { ...state().stats, lossTimes: [NOW - 1000] };
    expect(diagnose(state({ stats }), run()).tone).toBe("warn");
  });
});

describe("the four steps", () => {
  const answers = (...args: Parameters<typeof doctorSteps>) => doctorSteps(...args).map((step) => step.state);

  it("are all good when every layer answers", () => {
    expect(answers(state(), run())).toEqual(["ok", "ok", "ok", "ok"]);
  });

  it("run while nothing has landed", () => {
    expect(answers(state(), {})).toEqual(["running", "running", "running", "running"]);
  });

  it("answer as soon as the legs that settle them are in", () => {
    const { directory } = run();
    expect(answers(state(), { directory })).toEqual(["ok", "ok", "running", "running"]);
  });

  // Each step rests on the ones before it, so past a failure there is no answer.
  it("do not answer past the first failure", () => {
    const directory = { ok: false, exitCount: 0, millis: 20000, error: "boom" };
    expect(answers(state(), run({ directory, direct: directFailed }))).toEqual([
      "fail",
      "unchecked",
      "unchecked",
      "unchecked",
    ]);
    expect(answers(state(), run({ directory }))).toEqual(["ok", "fail", "unchecked", "unchecked"]);
  });

  it("clear the tunnel when the control gets through and only the server fails", () => {
    expect(answers(state(), run({ tunnelServer: tunnelFailed }))).toEqual(["ok", "ok", "ok", "fail"]);
  });

  it("blame the tunnel when nothing gets through", () => {
    expect(answers(state(), run({ tunnelServer: tunnelFailed, tunnelControl: tunnelFailed }))).toEqual([
      "ok",
      "ok",
      "fail",
      "unchecked",
    ]);
  });

  it("agree with the verdict when the server is its own control", () => {
    const noControl = { tunnelServer: tunnelFailed, tunnelControl: { skipped: "the server is the control" } };
    expect(answers(state(), run(noControl))).toEqual(["ok", "ok", "fail", "unchecked"]);
    expect(answers(state(), run({ ...noControl, direct: directFailed }))).toEqual(["ok", "ok", "unchecked", "fail"]);
  });

  it("do not fail a tunnel that simply is not up yet", () => {
    const noAddress = { skipped: "the proxy has no address yet" };
    expect(answers(state(), run({ listener: noAddress, tunnelServer: noAddress, tunnelControl: noAddress }))).toEqual([
      "ok",
      "ok",
      "unchecked",
      "unchecked",
    ]);
  });
});

describe("the rows", () => {
  // The wallet refusing is its answer while the mixnet is not ready, not a
  // measurement of the tunnel.
  it("does not count the wallet's refusal as a failed probe", () => {
    const rows = doctorRows(run({ walletProbe: { error: "the Nym mixnet is bootstrapping" } }));
    expect(rows.find((row) => row.label === "Wallet round trip")?.state).toBe("skip");
  });

  it("shows the stage and the cause a direct leg stopped at", () => {
    const row = doctorRows(run({ direct: directFailed })).find((r) => r.label === "Direct to the server");
    expect(row?.state).toBe("fail");
    expect(row?.value).toContain("tcp-connect");
    expect(row?.value).toContain("no answer within 20s");
  });
});

describe("the last cause", () => {
  it("prefers the wallet's typed cause over the proxy's words", () => {
    const cause = lastCause(
      state({
        status: {
          mode: "died",
          death: {
            at: NOW,
            detail: { stage: "tunnel-transport", target: "custom.example", cause_chain: ["broken pipe"] },
          },
        },
        stats: { ...state().stats, lastStderr: "older words" },
      }),
    );
    expect(cause).toContain("broken pipe");
    expect(cause).not.toContain("older words");
  });

  it("falls back to the proxy's words, the only cause of a proxy exit", () => {
    const stats = { ...state().stats, lastStderr: "nym-proxy: every exit failed" };
    expect(lastCause(state({ status: { mode: "died" }, stats }))).toBe("nym-proxy: every exit failed");
  });
});

describe("the history", () => {
  it("aggregates by host and route and shows how the last one ended", () => {
    const attempt = { at: 1, host: "zec.rocks", kind: "Probe", millis: 900, fault_domain: null };
    expect(
      historyLines([
        { ...attempt, route: "Mixnet", failure: null },
        { ...attempt, route: "Mixnet", failure: "Timeout" },
        { ...attempt, route: "Nakednet", failure: null },
      ]),
    ).toEqual([
      "zec.rocks over mixnet: 1/2 ok, last failed: Timeout",
      "zec.rocks over nakednet: 1/1 ok, last ok in 900 ms",
    ]);
  });
});

describe("the report", () => {
  it("starts with the line a support reply keys on", () => {
    expect(doctorReport(state(), null).split("\n")[0]).toBe(`## ${DOCTOR_HEADLINE}`);
  });

  it("carries the verdict, the measured rows and the journal", () => {
    const report = doctorReport(
      state({ journal: [{ at: NOW, level: "error", source: "proxy", text: "nym-proxy: every exit failed" }] }),
      run(),
    );
    expect(report).toContain("verdict: Everything is working");
    expect(report).toContain("Nym directory: OK");
    expect(report).toContain("nym-proxy: every exit failed");
  });
});
