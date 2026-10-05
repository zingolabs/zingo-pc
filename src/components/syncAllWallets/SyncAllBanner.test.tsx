import React from "react";
import { fireEvent, screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { render } from "../../test-utils";
import SyncAllBanner from "./SyncAllBanner";
import routes from "../../constants/routes.json";
import {
  CreationTypeEnum,
  PerformanceLevelEnum,
  ServerChainNameEnum,
  ServerSelectionEnum,
  WalletType,
} from "../appstate";
import { SyncAllContext } from "../../syncAll";
import type { SyncAllRun } from "../../syncAll";

jest.mock("../../electronBridge");

const wallet = (id: number, alias: string): WalletType => ({
  id,
  fileName: "",
  alias,
  chain_name: ServerChainNameEnum.mainChainName,
  creationType: CreationTypeEnum.Main,
  uri: "",
  selection: ServerSelectionEnum.list,
  performanceLevel: PerformanceLevelEnum.High,
});

const WALLETS = [wallet(1, "Savings"), wallet(2, "Spending"), wallet(3, "Old one")];

const run = (overrides: Partial<SyncAllRun>): SyncAllRun => ({
  phase: "idle",
  wallets: [],
  progress: {},
  endedIds: [],
  cancelling: false,
  skipping: false,
  start: jest.fn(),
  cancel: jest.fn(),
  skip: jest.fn(),
  dismiss: jest.fn(),
  releaseForScreen: jest.fn(),
  setWatched: jest.fn(),
  autoEnabled: false,
  setAutoEnabled: jest.fn(),
  ...overrides,
});

const renderBanner = (value: SyncAllRun) =>
  render(
    <SyncAllContext.Provider value={value}>
      <Routes>
        <Route path="/" element={<SyncAllBanner />} />
        <Route path={routes.SYNCALL} element={<div>the detail screen</div>} />
      </Routes>
    </SyncAllContext.Provider>,
  );

describe("SyncAllBanner", () => {
  it("is not there when no run has been started", () => {
    renderBanner(run({}));

    expect(screen.queryByTestId("sync-all-banner")).not.toBeInTheDocument();
  });

  it("says how far a run has got and which wallet it is on", () => {
    renderBanner(
      run({
        phase: "running",
        wallets: WALLETS,
        endedIds: [1],
        progress: { 1: { kind: "synced" }, 2: { kind: "syncing", server: "https://s", percent: 42.1 } },
      }),
    );

    const banner = screen.getByTestId("sync-all-banner");
    expect(banner).toHaveTextContent("Syncing all wallets");
    expect(banner).toHaveTextContent("1 of 3 done");
    expect(banner).toHaveTextContent("Spending: 42.10%");
  });

  it("leads to the screen with every wallet's state", () => {
    renderBanner(run({ phase: "running", wallets: WALLETS }));

    fireEvent.click(screen.getByRole("button", { name: "Details" }));

    expect(screen.getByText("the detail screen")).toBeInTheDocument();
  });

  // A finished run stays until it is put away, so a user who was elsewhere
  // when it ended still learns how it went.
  it("reports a finished run until it is dismissed", () => {
    const dismiss = jest.fn();
    renderBanner(
      run({
        phase: "done",
        wallets: WALLETS,
        endedIds: [1, 2, 3],
        progress: { 1: { kind: "synced" }, 2: { kind: "failed", reason: "no" }, 3: { kind: "synced" } },
        dismiss,
      }),
    );

    expect(screen.getByTestId("sync-all-banner")).toHaveTextContent("2 of 3 wallets synced");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(dismiss).toHaveBeenCalled();
  });
});
