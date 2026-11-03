import React from "react";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { render } from "../../../test-utils";
import MixnetModal from "./MixnetModal";
import RPC from "../../../rpc/rpc";
import { clipboard } from "../../../electronBridge";
import { DoctorRun, DoctorState } from "../../../rpc/components/mixnetDoctor";
import { deriveMixnetView } from "../../../rpc/components/mixnetPresenter";

jest.mock("../../../electronBridge");
jest.mock("../../../rpc/rpc");

const getState = RPC.getMixnetDoctorState as jest.MockedFunction<typeof RPC.getMixnetDoctorState>;
const runDoctor = RPC.runMixnetDoctor as jest.MockedFunction<typeof RPC.runMixnetDoctor>;
const restart = RPC.restartMixnet as jest.MockedFunction<typeof RPC.restartMixnet>;

const state: DoctorState = {
  at: 1_800_000_000_000,
  app: "2.0.27",
  platform: "win32",
  online: true,
  intent: "on",
  phase: "ready",
  retrying: false,
  nextRetryMs: null,
  narration: null,
  status: { mode: "ready" },
  wallet: { mode: "ready" },
  proxy: { path: "nym-proxy.exe", exists: true, pid: 1, running: true, socks5Addr: "127.0.0.1:1", exits: [] },
  stats: {
    bootstraps: 2,
    proxyExits: 1,
    attachesFailed: 0,
    walletDeaths: 0,
    restarts: 0,
    redraws: 0,
    reconnectsScheduled: 1,
    timesReady: 1,
    lossTimes: [],
    lastBootstrapMs: null,
    lastAttachMs: null,
    lastReadyAt: null,
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
  journal: [
    { at: 1_800_000_000_000, level: "error", source: "proxy", text: "nym-proxy: every exit failed" },
    { at: 1_800_000_001_000, level: "info", source: "proxy", text: "racing a clutch of 4 exits" },
  ],
};

const tunnelOk = { ok: true, millis: 3000, target: "custom.example:443", stages: [] };
const tunnelFailed = { ok: false, millis: 30000, target: "custom.example:443", stages: [], error: "no answer" };

const run: DoctorRun = {
  startedAt: 1_800_000_000_000,
  millis: 5000,
  socks5Addr: "127.0.0.1:1",
  directory: { ok: true, exitCount: 872, millis: 1500 },
  listener: { ok: true, millis: 1 },
  tunnelServer: tunnelOk,
  tunnelControl: tunnelOk,
  walletProbe: [{ host: "custom.example", millis: 3000, chain: "main", height: 3_000_000 }],
  direct: { server: "custom.example", stages: [], chain: "main", height: 3_000_000 },
};

const show = () =>
  render(<MixnetModal modalIsOpen closeModal={jest.fn()} />, {
    contextOverrides: { mixnetView: deriveMixnetView({ mode: "ready" }) },
  });

beforeEach(() => {
  getState.mockReset().mockResolvedValue(state);
  runDoctor.mockReset().mockResolvedValue(run);
  restart.mockReset().mockResolvedValue(undefined);
  (clipboard.writeText as jest.Mock).mockReset();
});

test("opens on one sentence, with the journal put away", async () => {
  show();

  expect(await screen.findByText("Connected")).toBeInTheDocument();
  expect(screen.queryByTestId("mixnet-doctor-journal")).toBeNull();
  expect(screen.queryByText("Nym network")).toBeNull();
});

// One leg leaves from the real IP, so opening the screen must not start it.
test("measures nothing until the user asks", async () => {
  show();
  await screen.findByText("Connected");

  expect(runDoctor).not.toHaveBeenCalled();
});

test("answers the four steps after a run, with no figures among them", async () => {
  show();

  fireEvent.click(await screen.findByRole("button", { name: "Run diagnostics" }));

  expect(await screen.findByText("Everything is working")).toBeInTheDocument();
  expect(screen.getByText("Your internet connection")).toBeInTheDocument();
  expect(screen.getByText("Your server")).toBeInTheDocument();
  expect(screen.queryByText(/872 exits/)).toBeNull();
  expect(await screen.findByRole("button", { name: "Run again" })).toBeInTheDocument();
});

test("the details open in their own screen, with the figures, the journal and two buttons", async () => {
  show();
  fireEvent.click(await screen.findByRole("button", { name: "Run diagnostics" }));
  await screen.findByText("Everything is working");

  fireEvent.click(screen.getByRole("button", { name: "Technical details" }));

  expect(screen.getByText(/872 exits/)).toBeInTheDocument();
  const journal = screen.getByTestId("mixnet-doctor-journal");
  expect(within(journal).getAllByText(/proxy:/)[0]).toHaveTextContent("racing a clutch of 4 exits");

  fireEvent.click(screen.getByRole("button", { name: "Copy report" }));
  expect((clipboard.writeText as jest.Mock).mock.calls[0][0]).toContain("nym-proxy: every exit failed");

  // Closing them goes back to the Mixnet screen, which is still there underneath.
  fireEvent.click(screen.getAllByRole("button", { name: "Close" }).pop()!);
  expect(screen.queryByTestId("mixnet-doctor-journal")).toBeNull();
  expect(screen.getByText("Everything is working")).toBeInTheDocument();
});

test("marks what has landed while the slower legs are still running", async () => {
  runDoctor.mockReturnValue(new Promise(() => {}));
  getState.mockResolvedValue({ ...state, doctorProgress: { directory: run.directory } });
  show();

  fireEvent.click(await screen.findByRole("button", { name: "Run diagnostics" }));

  expect(await screen.findByText("Checking…")).toBeInTheDocument();
  expect(await screen.findByText("Nym network")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Run again" })).toBeDisabled();
});

test("a fault offers what fixes it, and the report we would ask for", async () => {
  runDoctor.mockResolvedValue({ ...run, tunnelServer: tunnelFailed, tunnelControl: tunnelFailed });
  show();

  fireEvent.click(await screen.findByRole("button", { name: "Run diagnostics" }));

  expect(await screen.findByText("The mixnet isn't carrying data")).toBeInTheDocument();
  expect(screen.getByText("answers directly")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Restart" }));
  expect(restart).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole("button", { name: "Copy report" }));
  expect((clipboard.writeText as jest.Mock).mock.calls[0][0]).toContain("nym-proxy: every exit failed");
  expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
});

test("a server the mixnet cannot reach offers choosing another", async () => {
  runDoctor.mockResolvedValue({ ...run, tunnelServer: tunnelFailed });
  show();

  fireEvent.click(await screen.findByRole("button", { name: "Run diagnostics" }));

  expect(await screen.findByText("Your server can't be reached through the mixnet")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Choose server" })).toBeInTheDocument();
});

// The report that started this: a run's failure stayed on screen after the mixnet
// connected, with the sidebar behind it already saying otherwise.
test("drops a failed run's verdict once the transport has moved on, keeping it for the details", async () => {
  const lost: DoctorState = { ...state, status: { mode: "died" } };
  getState.mockResolvedValue(lost);
  runDoctor.mockResolvedValue({ ...run, tunnelServer: tunnelFailed, tunnelControl: tunnelFailed });
  show();

  fireEvent.click(await screen.findByRole("button", { name: "Run diagnostics" }));
  expect(await screen.findByText("The mixnet isn't carrying data")).toBeInTheDocument();

  getState.mockResolvedValue(state);

  expect(await screen.findByText("Connected", {}, { timeout: 3000 })).toBeInTheDocument();
  expect(screen.queryByText("The mixnet isn't carrying data")).toBeNull();
  expect(screen.queryByText("Nym network")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Technical details" }));
  expect(screen.getByText(/872 exits/)).toBeInTheDocument();
  expect(screen.getByText(/on a connection that has since changed/)).toBeInTheDocument();
  expect(screen.queryByText("✗")).toBeNull();

  (clipboard.writeText as jest.Mock).mockReset();
  fireEvent.click(within(screen.getAllByRole("dialog").slice(-1)[0]).getByRole("button", { name: "Copy report" }));
  const report = (clipboard.writeText as jest.Mock).mock.calls[0][0];
  expect(report).toContain("verdict: Connected");
  expect(report).toContain("on a connection that has since changed");
});

// A redraw goes ready, bootstrapping, ready: the status ends where it was measured,
// on a different proxy.
test("drops a run's verdict when the proxy was replaced, even with the same status", async () => {
  runDoctor.mockResolvedValue({ ...run, tunnelServer: tunnelFailed, tunnelControl: tunnelFailed });
  show();

  fireEvent.click(await screen.findByRole("button", { name: "Run diagnostics" }));
  expect(await screen.findByText("The mixnet isn't carrying data")).toBeInTheDocument();

  getState.mockResolvedValue({ ...state, proxy: { ...state.proxy, socks5Addr: "127.0.0.1:2" } });

  expect(await screen.findByText("Connected", {}, { timeout: 3000 })).toBeInTheDocument();
});

test("keeps following the transport while it is open, and stops when it closes", async () => {
  jest.useFakeTimers();
  try {
    const { unmount } = show();
    await act(async () => {
      await Promise.resolve();
    });
    const opened = getState.mock.calls.length;

    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
    });
    expect(getState.mock.calls.length).toBe(opened + 1);

    unmount();
    jest.advanceTimersByTime(10000);
    expect(getState.mock.calls.length).toBe(opened + 1);
  } finally {
    jest.useRealTimers();
  }
});
