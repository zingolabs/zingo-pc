import React from "react";
import { act, fireEvent, screen } from "@testing-library/react";
import { render } from "../../test-utils";
import SyncAllSettingsModal from "./SyncAllSettingsModal";
import { SyncAllContext } from "../../syncAll";
import type { SyncAllRun } from "../../syncAll";

jest.mock("../../electronBridge");
jest.mock("react-modal", () => {
  const Modal = ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div>{children}</div> : null;
  Modal.setAppElement = () => {};
  return Modal;
});

const run = (autoEnabled: boolean, setAutoEnabled: jest.Mock, extra: Partial<SyncAllRun> = {}): SyncAllRun => ({
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
  autoEnabled,
  setAutoEnabled,
  nextAutoRunAt: null,
  ...extra,
});

const renderModal = (autoEnabled: boolean, extra: Partial<SyncAllRun> = {}) => {
  const setAutoEnabled = jest.fn();
  const onClose = jest.fn();
  render(
    <SyncAllContext.Provider value={run(autoEnabled, setAutoEnabled, extra)}>
      <SyncAllSettingsModal isOpen onClose={onClose} />
    </SyncAllContext.Provider>,
  );
  return { setAutoEnabled, onClose };
};

describe("SyncAllSettingsModal", () => {
  it("opens on what is saved, with nothing to save yet", () => {
    renderModal(true);

    expect(screen.getByRole("checkbox", { name: "Sync all wallets automatically" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByText(/every 15 minutes/i)).toBeInTheDocument();
  });

  it("changes the setting on Save, not on the tick", () => {
    const { setAutoEnabled, onClose } = renderModal(true);

    fireEvent.click(screen.getByRole("checkbox", { name: "Sync all wallets automatically" }));
    expect(setAutoEnabled).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(setAutoEnabled).toHaveBeenCalledWith(false);
    expect(onClose).toHaveBeenCalled();
  });

  it("leaves the setting alone on Cancel", () => {
    const { setAutoEnabled, onClose } = renderModal(false);

    fireEvent.click(screen.getByRole("checkbox", { name: "Sync all wallets automatically" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(setAutoEnabled).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  describe("the countdown to the next run", () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2026-10-05T10:00:00Z"));
    });
    afterEach(() => jest.useRealTimers());

    it("counts down to the next run while the app syncs by itself", () => {
      renderModal(true, { nextAutoRunAt: Date.now() + 4 * 60 * 1000 + 7 * 1000 });

      expect(screen.getByTestId("sync-all-next-run")).toHaveTextContent("Next sync in 4:07.");
      act(() => void jest.advanceTimersByTime(2000));
      expect(screen.getByTestId("sync-all-next-run")).toHaveTextContent("Next sync in 4:05.");
    });

    it("says so while a run is going", () => {
      renderModal(true, { phase: "running", nextAutoRunAt: null });

      expect(screen.getByTestId("sync-all-next-run")).toHaveTextContent("Syncing now.");
    });

    it("shows nothing when the app does not sync by itself", () => {
      renderModal(false, { nextAutoRunAt: null });

      expect(screen.queryByTestId("sync-all-next-run")).not.toBeInTheDocument();
    });
  });
});
