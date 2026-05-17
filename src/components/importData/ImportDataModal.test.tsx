import React from "react";
import { render, screen, fireEvent } from "../../test-utils";

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
const ImportDataModal = require("./ImportDataModal").default;
type ImportScanResult = { sourceDir: string; present: string[] };

const scanResultBoth: ImportScanResult = {
  sourceDir: "/Users/test/Library/Application Support/Zingo PC",
  present: ["wallets.json", "AddressBook.json"],
};

const baseProps = {
  isOpen: true,
  onClose: jest.fn(),
  scanResult: scanResultBoth,
};

describe("ImportDataModal", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue({ ok: true });
  });

  it("renders the modal title and source folder", () => {
    render(<ImportDataModal {...baseProps} />);
    expect(screen.getByText("Import Data")).toBeInTheDocument();
    expect(screen.getByText(scanResultBoth.sourceDir)).toBeInTheDocument();
  });

  it("does not render content when closed", () => {
    render(<ImportDataModal {...baseProps} isOpen={false} />);
    expect(screen.queryByText("Import Data")).not.toBeInTheDocument();
  });

  it("renders the wallets.json row when present in scan result", () => {
    render(<ImportDataModal {...baseProps} />);
    expect(screen.getByText("wallets.json")).toBeInTheDocument();
  });

  it("renders the AddressBook.json row when present in scan result", () => {
    render(<ImportDataModal {...baseProps} />);
    expect(screen.getByText("AddressBook.json")).toBeInTheDocument();
  });

  it("hides the wallets row when not present", () => {
    render(
      <ImportDataModal
        {...baseProps}
        scanResult={{ sourceDir: scanResultBoth.sourceDir, present: ["AddressBook.json"] }}
      />,
    );
    expect(screen.queryByText("wallets.json")).not.toBeInTheDocument();
    expect(screen.getByText("AddressBook.json")).toBeInTheDocument();
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = jest.fn();
    render(<ImportDataModal {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("invokes import:apply with the user-selected choices when Apply is clicked", () => {
    render(<ImportDataModal {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /apply & restart/i }));
    expect(mockInvoke).toHaveBeenCalledWith("import:apply", {
      sourceDir: scanResultBoth.sourceDir,
      choices: {
        settings: "skip",
        wallets: "merge",
        addressBook: "merge",
      },
    });
  });

  it("disables Apply when every present file is set to skip", () => {
    render(<ImportDataModal {...baseProps} />);
    const selects = screen.getAllByRole("combobox");
    // Both rows have a "skip" option; switch both to skip
    fireEvent.change(selects[0], { target: { value: "skip" } });
    fireEvent.change(selects[1], { target: { value: "skip" } });
    expect(screen.getByRole("button", { name: /apply & restart/i })).toBeDisabled();
  });
});
