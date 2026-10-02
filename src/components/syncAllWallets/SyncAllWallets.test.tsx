import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
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
import type { SessionPoll, SyncAllDeps } from "../../syncAll";

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

/** Sessions that reach the tip on their first poll, unless `poll` says otherwise. */
const fakeDeps = (overrides: Partial<SyncAllDeps> = {}): SyncAllDeps => ({
  resolveServer: async (w) => w.uri,
  walletExists: async () => true,
  open: async () => {},
  launch: async () => {},
  poll: async (): Promise<SessionPoll> => ({ kind: "running" }),
  progress: async () => ({ caughtUp: true, percent: null }),
  stop: async () => {},
  save: async () => {},
  sleep: async () => {},
  ...overrides,
});

const renderScreen = (deps: SyncAllDeps = fakeDeps()) => {
  const clearTimers = jest.fn(async () => {});
  const onBack = jest.fn();
  const onExit = jest.fn();
  render(<SyncAllWallets clearTimers={clearTimers} onBack={onBack} onExit={onExit} makeDeps={() => deps} />, {
    contextOverrides: { wallets: WALLETS },
  });
  return { clearTimers, onBack, onExit };
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
  it("says what is about to happen and lists the wallets in the order they will be synced", () => {
    renderScreen();

    expect(screen.getByText(/the app does nothing else/i)).toBeInTheDocument();
    const rows = screen.getAllByTestId(/^sync-all-wallet-/);
    expect(rows.map((row) => row.getAttribute("data-testid"))).toEqual(["sync-all-wallet-1", "sync-all-wallet-2"]);
  });

  // Backing out of the warning is not a cancelled run: the open wallet's
  // session was never stopped, so there is nothing to reopen.
  it("touches nothing when the user backs out of the warning", () => {
    const { clearTimers, onBack, onExit } = renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onBack).toHaveBeenCalled();
    expect(onExit).not.toHaveBeenCalled();
    expect(clearTimers).not.toHaveBeenCalled();
    expect(keepAwakeCalls()).toEqual([]);
  });

  it("syncs every wallet, keeps the computer awake meanwhile, and reports", async () => {
    const { clearTimers, onExit } = renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Sync all wallets" }));

    await waitFor(() => expect(screen.getByTestId("sync-all-summary")).toHaveTextContent("2 of 2 wallets synced."));
    expect(clearTimers).toHaveBeenCalled();
    expect(keepAwakeCalls()).toEqual([true, false]);

    fireEvent.click(screen.getByRole("button", { name: "Back to my wallet" }));
    expect(onExit).toHaveBeenCalled();
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

    fireEvent.click(screen.getByRole("button", { name: "Sync all wallets" }));

    await waitFor(() => expect(screen.getByTestId("sync-all-summary")).toHaveTextContent("1 of 2 wallets synced."));
    expect(screen.getByTestId("sync-all-wallet-1")).toHaveTextContent("This server cannot serve this wallet.");
    expect(screen.getByTestId("sync-all-wallet-2")).toHaveTextContent("Synced");
  });

  // The user asked to stop, not to read a report: the wallet in hand is
  // stopped and saved, and the app goes back to the one that was open.
  it("goes straight back to the open wallet when the run is cancelled", async () => {
    let release: () => void = () => {};
    const saved: string[] = [];
    const { onExit } = renderScreen(
      fakeDeps({
        progress: async () => ({ caughtUp: false, percent: null }),
        sleep: () => new Promise<void>((resolve) => (release = resolve)),
        save: async () => {
          saved.push("saved");
        },
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Sync all wallets" }));
    await waitFor(() => expect(screen.getByTestId("sync-all-wallet-1")).toHaveTextContent("Opening..."));

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Cancelling..." })).toBeDisabled();
    release();

    await waitFor(() => expect(onExit).toHaveBeenCalled());
    // Once for the wallet that was open, once for the one the run had in hand.
    expect(saved).toHaveLength(2);
    expect(keepAwakeCalls()).toEqual([true, false]);
    expect(screen.queryByTestId("sync-all-summary")).not.toBeInTheDocument();
  });

  // A wallet far behind would otherwise hold every run at the same place.
  it("skips the wallet in hand and goes on to the next", async () => {
    let release: () => void = () => {};
    let opened = 0;
    const { onExit } = renderScreen(
      fakeDeps({
        open: async (w) => {
          opened = w.id;
        },
        // The first wallet never reaches the tip; the second does at once.
        progress: async () => ({ caughtUp: opened !== 1, percent: null }),
        sleep: () => new Promise<void>((resolve) => (release = resolve)),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Sync all wallets" }));
    await waitFor(() => expect(screen.getByTestId("sync-all-wallet-1")).toHaveTextContent("Opening..."));

    fireEvent.click(screen.getByRole("button", { name: "Skip this wallet" }));
    expect(screen.getByRole("button", { name: "Skipping..." })).toBeDisabled();
    release();

    await waitFor(() => expect(screen.getByTestId("sync-all-summary")).toHaveTextContent("1 of 2 wallets synced."));
    expect(screen.getByTestId("sync-all-wallet-1")).toHaveTextContent("Skipped");
    expect(screen.getByTestId("sync-all-wallet-2")).toHaveTextContent("Synced");
    expect(onExit).not.toHaveBeenCalled();
  });
});
