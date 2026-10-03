import React from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "../../test-utils";
import SyncAllWallets from "./SyncAllWallets";
import { ipcRenderer } from "../../electronBridge";
import {
  CreationTypeEnum,
  PerformanceLevelEnum,
  ServerChainNameEnum,
  ServerSelectionEnum,
  WalletType,
} from "../appstate";
import { SyncAllContext, syncAllOrder, useSyncAllRun } from "../../syncAll";
import SyncAllNotice from "./SyncAllNotice";
import type { SessionPoll, SyncAllDeps, SyncAllRun } from "../../syncAll";

jest.mock("../../electronBridge");

const wallet = (id: number, alias: string, chain_name: ServerChainNameEnum): WalletType => ({
  id,
  fileName: "",
  alias,
  chain_name,
  creationType: CreationTypeEnum.Main,
  uri: `https://server-${id}`,
  selection: ServerSelectionEnum.list,
  performanceLevel: PerformanceLevelEnum.High,
});

// Given out of order, so the order on screen is the run's and not the list's.
const WALLETS: WalletType[] = [
  wallet(2, "Test coins", ServerChainNameEnum.testChainName),
  wallet(1, "Savings", ServerChainNameEnum.mainChainName),
];

/** Sessions that reach the tip on their first poll, unless told otherwise. */
const fakeDeps = (overrides: Partial<SyncAllDeps> = {}): SyncAllDeps => ({
  resolveServer: async (w) => w.uri,
  walletExists: async () => true,
  open: async () => {},
  launch: async () => {},
  poll: async (): Promise<SessionPoll> => ({ kind: "running" }),
  progress: async () => ({ caughtUp: true, percent: null }),
  stop: async () => {},
  save: async () => {},
  close: async () => {},
  sleep: async () => {},
  ...overrides,
});

/** Starts a run the way the Wallet menu does once the user has confirmed. */
let startRun: () => void = () => {};

/**
 * The screen under the run it reads, as the app mounts them: the run above,
 * the screen below, so the screen can come and go while the run stays.
 */
const renderScreen = (deps: SyncAllDeps = fakeDeps(), openWalletId?: number) => {
  const onClose = jest.fn();
  const held: { run: SyncAllRun | null; showScreen: (show: boolean) => void } = { run: null, showScreen: () => {} };
  const makeDeps = () => deps;

  const Harness: React.FC = () => {
    const run = useSyncAllRun(openWalletId, makeDeps);
    const [shown, setShown] = React.useState<boolean>(true);
    held.run = run;
    held.showScreen = setShown;
    return (
      <SyncAllContext.Provider value={run}>{shown && <SyncAllWallets onClose={onClose} />}</SyncAllContext.Provider>
    );
  };

  render(<Harness />);
  startRun = () => act(() => held.run!.start(syncAllOrder(WALLETS)));
  return { onClose, held };
};

const keepAwakeCalls = () =>
  (ipcRenderer.invoke as jest.Mock).mock.calls
    .filter(([channel]) => channel === "power:keep-awake")
    .map(([, on]) => on);

beforeEach(() => {
  (ipcRenderer.invoke as jest.Mock).mockReset();
  (ipcRenderer.invoke as jest.Mock).mockResolvedValue(undefined);
});

describe("SyncAllWallets", () => {
  // The screen shows a run. With none, it has nothing to show and leaves.
  it("leaves when there is no run", () => {
    const { onClose } = renderScreen();

    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByText("Sync all wallets")).not.toBeInTheDocument();
  });

  it("syncs every wallet, keeps the computer awake meanwhile, and reports", async () => {
    const { onClose, held } = renderScreen();
    onClose.mockClear();

    startRun();

    await waitFor(() => expect(screen.getByTestId("sync-all-summary")).toHaveTextContent("2 of 2 wallets synced."));
    expect(keepAwakeCalls()).toEqual([true, false]);
    // In the order the run takes them, whatever order the app holds them in.
    expect(held.run?.wallets.map((w) => w.id)).toEqual([1, 2]);

    // Closing a finished run puts it away.
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
    expect(held.run?.phase).toBe("idle");
  });

  it("shows why a wallet could not be synced, and still counts the others", async () => {
    let opened = 0;
    renderScreen(
      fakeDeps({
        open: async (w) => {
          opened = w.id;
        },
        poll: async (): Promise<SessionPoll> =>
          opened === 1
            ? { kind: "failed", reason: "no tree state", recovery: "server_unavailable" }
            : { kind: "running" },
      }),
    );

    startRun();

    await waitFor(() => expect(screen.getByTestId("sync-all-summary")).toHaveTextContent("1 of 2 wallets synced."));
    expect(screen.getByTestId("sync-all-wallet-1")).toHaveTextContent("This server cannot serve this wallet.");
    expect(screen.getByTestId("sync-all-wallet-2")).toHaveTextContent("Synced");
  });

  // Its own session syncs it. Two clients on one wallet file would each
  // overwrite the other's scans.
  it("leaves the wallet that is open in the app to its own sync", async () => {
    const opened: number[] = [];
    renderScreen(
      fakeDeps({
        open: async (w) => {
          opened.push(w.id);
        },
      }),
      1,
    );

    startRun();

    await waitFor(() => expect(screen.getByTestId("sync-all-summary")).toHaveTextContent("1 of 2 wallets synced."));
    expect(opened).toEqual([2]);
    expect(screen.getByTestId("sync-all-wallet-1")).toHaveTextContent("Open in the app");
  });

  // The run is not the screen's. Leaving and coming back finds it where it
  // has got to, which is what lets the user use the app meanwhile.
  it("goes on while the screen is away, and shows where it has got to on return", async () => {
    let release: () => void = () => {};
    let opened = 0;
    const { held } = renderScreen(
      fakeDeps({
        open: async (w) => {
          opened = w.id;
        },
        progress: async () => ({ caughtUp: opened === 1, percent: 12.5 }),
        sleep: () => new Promise<void>((resolve) => (release = resolve)),
      }),
    );

    startRun();
    await waitFor(() => expect(screen.getByTestId("sync-all-in-hand")).toHaveTextContent("Test coins"));

    act(() => held.showScreen(false));
    expect(screen.queryByText("Sync all wallets")).not.toBeInTheDocument();
    expect(held.run?.phase).toBe("running");

    act(() => held.showScreen(true));
    expect(screen.getByTestId("sync-all-in-hand")).toHaveTextContent("Syncing 12.50%");
    expect(screen.getByTestId("sync-all-wallet-1")).toHaveTextContent("Synced");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    release();
    await waitFor(() => expect(held.run?.phase).toBe("done"));
  });

  it("stops and saves the wallet in hand when the run is cancelled", async () => {
    let release: () => void = () => {};
    const done: string[] = [];
    renderScreen(
      fakeDeps({
        progress: async () => ({ caughtUp: false, percent: null }),
        sleep: () => new Promise<void>((resolve) => (release = resolve)),
        save: async () => {
          done.push("save");
        },
        close: async () => {
          done.push("close");
        },
      }),
    );

    startRun();
    await waitFor(() => expect(screen.getByTestId("sync-all-wallet-1")).toHaveTextContent("Opening..."));

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Cancelling..." })).toBeDisabled();
    release();

    await waitFor(() => expect(screen.getByTestId("sync-all-summary")).toHaveTextContent("0 of 2 wallets synced."));
    expect(done).toEqual(["save", "close"]);
    expect(keepAwakeCalls()).toEqual([true, false]);
    expect(screen.getByTestId("sync-all-wallet-2")).toHaveTextContent("Not synced");
  });

  // With many wallets the rows that change are the ones out of sight. So the
  // wallet in hand sits on its own above the list, and the list puts the
  // latest finished wallet first, where the user is looking.
  it("keeps the wallet in hand above the list, and the latest finished wallet first below", async () => {
    let release: () => void = () => {};
    let opened = 0;
    renderScreen(
      fakeDeps({
        open: async (w) => {
          opened = w.id;
        },
        progress: async () => ({ caughtUp: opened === 1, percent: null }),
        sleep: () => new Promise<void>((resolve) => (release = resolve)),
      }),
    );

    startRun();
    await waitFor(() => expect(screen.getByTestId("sync-all-in-hand")).toHaveTextContent("Test coins"));

    expect(screen.getByTestId("sync-all-in-hand")).toHaveTextContent("Opening...");
    const listed = screen.getAllByTestId(/^sync-all-wallet-/);
    expect(listed.map((row) => row.getAttribute("data-testid"))).toEqual(["sync-all-wallet-2", "sync-all-wallet-1"]);
    expect(listed[1]).toHaveTextContent("Synced");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    release();
  });

  // A wallet far behind would otherwise hold every run at the same place.
  it("skips the wallet in hand and goes on to the next", async () => {
    let release: () => void = () => {};
    let opened = 0;
    renderScreen(
      fakeDeps({
        open: async (w) => {
          opened = w.id;
        },
        // The first wallet never reaches the tip; the second does at once.
        progress: async () => ({ caughtUp: opened !== 1, percent: null }),
        sleep: () => new Promise<void>((resolve) => (release = resolve)),
      }),
    );

    startRun();
    await waitFor(() => expect(screen.getByTestId("sync-all-wallet-1")).toHaveTextContent("Opening..."));

    fireEvent.click(screen.getByRole("button", { name: "Skip this wallet" }));
    expect(screen.getByRole("button", { name: "Skipping..." })).toBeDisabled();
    release();

    await waitFor(() => expect(screen.getByTestId("sync-all-summary")).toHaveTextContent("1 of 2 wallets synced."));
    expect(screen.getByTestId("sync-all-wallet-1")).toHaveTextContent("Skipped");
    expect(screen.getByTestId("sync-all-wallet-2")).toHaveTextContent("Synced");
  });

  // The user picks, in the app, the wallet the run has in hand. Opening it
  // waits until the run has stopped, saved and closed it: only then is the
  // file free.
  it("lets go of the wallet in hand before the app opens it", async () => {
    let release: () => void = () => {};
    const done: string[] = [];
    const { held } = renderScreen(
      fakeDeps({
        progress: async () => ({ caughtUp: false, percent: null }),
        sleep: () => new Promise<void>((resolve) => (release = resolve)),
        close: async () => {
          done.push("closed");
        },
      }),
    );

    startRun();
    await waitFor(() => expect(screen.getByTestId("sync-all-in-hand")).toHaveTextContent("Savings"));

    let released = false;
    const releasing = held.run!.releaseForScreen(1).then(() => {
      released = true;
      done.push("free to open");
    });
    expect(released).toBe(false);
    release();
    await act(async () => {
      await releasing;
    });

    expect(done).toEqual(["closed", "free to open"]);
    expect(screen.getByTestId("sync-all-wallet-1")).toHaveTextContent("Open in the app");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    release();
  });
});

describe("SyncAllNotice", () => {
  // The confirmation is the one place the user is told what a run costs
  // before it starts.
  it("says the app stays in use, and what a run costs meanwhile", () => {
    render(<SyncAllNotice />);

    expect(screen.getByText(/you can keep using the app/i)).toBeInTheDocument();
    expect(screen.getByText(/sending and shielding take longer/i)).toBeInTheDocument();
    expect(screen.getByText(/the wallet you have open is left to its own sync/i)).toBeInTheDocument();
  });
});
