import React from "react";
import { render, screen, waitFor } from "../../test-utils";

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
});
