import React from "react";
import { render, screen, fireEvent, waitFor } from "../../test-utils";

const mockInvoke = jest.fn();

// Must be set at module scope before LockScreen is required,
// because LockScreen reads window.electronAPI on load.
Object.defineProperty(window, "electronAPI", {
  configurable: true,
  writable: true,
  value: { ipcRenderer: { invoke: mockInvoke } },
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const LockScreen = require("./LockScreen").default;

describe("LockScreen", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it("renders the lock screen with Unlock button", () => {
    render(<LockScreen onUnlock={jest.fn()} />);
    expect(screen.getByRole("button", { name: /unlock/i })).toBeInTheDocument();
  });

  it("shows 'Zingo PC is locked' text", () => {
    render(<LockScreen onUnlock={jest.fn()} />);
    expect(screen.getByText("Zingo PC is locked")).toBeInTheDocument();
  });

  it("calls onUnlock when authentication succeeds", async () => {
    mockInvoke.mockResolvedValue({ success: true });
    const onUnlock = jest.fn();
    render(<LockScreen onUnlock={onUnlock} />);
    fireEvent.click(screen.getByRole("button", { name: /unlock/i }));
    await waitFor(() => expect(onUnlock).toHaveBeenCalledTimes(1));
  });

  it("shows error message when authentication fails", async () => {
    mockInvoke.mockResolvedValue({ success: false });
    render(<LockScreen onUnlock={jest.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /unlock/i }));
    await screen.findByText(/authentication was not completed/i);
  });

  it("shows error message when authentication throws", async () => {
    mockInvoke.mockRejectedValue(new Error("biometric error"));
    render(<LockScreen onUnlock={jest.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /unlock/i }));
    await screen.findByText(/authentication failed/i);
  });
});
