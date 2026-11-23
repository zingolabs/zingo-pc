import React from "react";
import { fireEvent, render, screen, waitFor } from "../../test-utils";

const mockInvoke = jest.fn();

Object.defineProperty(window, "electronAPI", {
  configurable: true,
  writable: true,
  value: { ipcRenderer: { invoke: mockInvoke } },
});

beforeAll(() => {
  const div = document.createElement("div");
  div.setAttribute("id", "root");
  document.body.appendChild(div);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("react-modal").setAppElement("#root");
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const AppSecurityModal = require("./AppSecurityModal").default;

describe("AppSecurityModal", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === "loadSettings") return Promise.resolve({ requireDeviceAuth: false });
      if (channel === "auth:check") return Promise.resolve("available");
      return Promise.resolve(null);
    });
  });

  it("does not render content when closed", () => {
    render(<AppSecurityModal isOpen={false} onClose={jest.fn()} />);
    expect(screen.queryByText("App Security")).not.toBeInTheDocument();
  });

  it("renders 'App Security' title when open", async () => {
    render(<AppSecurityModal isOpen={true} onClose={jest.fn()} />);
    expect(screen.getByText("App Security")).toBeInTheDocument();
  });

  it("shows the checkbox for device authentication", async () => {
    render(<AppSecurityModal isOpen={true} onClose={jest.fn()} />);
    expect(screen.getByRole("checkbox", { name: /require device authentication/i })).toBeInTheDocument();
  });

  it("calls onClose when Cancel is clicked", async () => {
    const onClose = jest.fn();
    render(<AppSecurityModal isOpen={true} onClose={onClose} />);
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("auth:check"));
    screen.getByRole("button", { name: /cancel/i }).click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows unavailable message when auth is not supported", async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === "loadSettings") return Promise.resolve({ requireDeviceAuth: false });
      if (channel === "auth:check") return Promise.resolve("not_supported");
      return Promise.resolve(null);
    });
    render(<AppSecurityModal isOpen={true} onClose={jest.fn()} />);
    await screen.findByText(/not supported on this platform/i);
  });

  const turnOff = async (saveAnswer: unknown) => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === "loadSettings") return Promise.resolve({ requireDeviceAuth: true });
      if (channel === "auth:check") return Promise.resolve("available");
      if (channel === "saveSettings") return Promise.resolve(saveAnswer);
      return Promise.resolve(null);
    });
    const onClose = jest.fn();
    render(<AppSecurityModal isOpen={true} onClose={onClose} />);
    const checkbox = screen.getByRole("checkbox", { name: /require device authentication/i });
    await waitFor(() => expect(checkbox).toBeChecked());
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("saveSettings", expect.anything()));
    return { onClose, checkbox };
  };

  it("Tests that turning it off stays on and open when the main process is not given the confirmation", async () => {
    const { onClose, checkbox } = await turnOff({ saved: false });
    await waitFor(() => expect(checkbox).toBeChecked());
    expect(mockInvoke).toHaveBeenCalledWith("saveSettings", { key: "requireDeviceAuth", value: false });
    expect(onClose).not.toHaveBeenCalled();
    expect(checkbox).toBeChecked();
  });

  it("Tests that turning it off closes when the main process saves it", async () => {
    const { onClose } = await turnOff({ saved: true });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
