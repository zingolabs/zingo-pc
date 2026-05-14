import React from "react";
import { screen } from "@testing-library/react";
import { render } from "../../test-utils";
import AddNewWallet from "./AddNewWallet";
import { ipcRenderer } from "../../electronBridge";

jest.mock("../../electronBridge");

const mockSettings = { serveruri: "", serverchain_name: "main", serverselection: "" };

beforeEach(() => {
  (ipcRenderer.invoke as jest.Mock).mockResolvedValue(mockSettings);
});

const baseProps = {
  closeModal: jest.fn(),
  setWallets: jest.fn(),
  setCurrentWallet: jest.fn(),
  navigateToLoadingScreenChangingWallet: jest.fn(),
  doSaveWallet: jest.fn(),
  clearTimers: jest.fn().mockResolvedValue(undefined),
};

describe("AddNewWallet modes", () => {
  it('shows "Add a New Wallet" heading in addnew mode', () => {
    render(<AddNewWallet {...baseProps} />, { initialRoute: "/addnewwallet" });
    expect(screen.getByText("Add a New Wallet")).toBeInTheDocument();
  });

  it('shows "Create Wallet" action button in addnew mode', () => {
    render(<AddNewWallet {...baseProps} />, { initialRoute: "/addnewwallet" });
    expect(screen.getByRole("button", { name: /create wallet/i })).toBeInTheDocument();
  });

  it('shows "Wallet Settings" heading in settings mode', () => {
    render(<AddNewWallet {...baseProps} />, {
      initialRoute: "/addnewwallet",
      contextOverrides: { currentWallet: { wallet_name: "test.dat", chain_name: "main" } as never },
    });
    // Navigate with settings state — use MemoryRouter initialEntries
    render(<AddNewWallet {...baseProps} />, {
      initialRoute: { pathname: "/addnewwallet", state: { mode: "settings" } } as never,
    });
    expect(screen.getAllByText("Wallet Settings").length).toBeGreaterThanOrEqual(1);
  });

  it('shows "Delete Wallet" heading in delete mode', () => {
    render(<AddNewWallet {...baseProps} />, {
      initialRoute: { pathname: "/addnewwallet", state: { mode: "delete" } } as never,
    });
    expect(screen.getAllByText("Delete Wallet").length).toBeGreaterThanOrEqual(1);
  });

  it("shows Close button before action button", () => {
    render(<AddNewWallet {...baseProps} />, { initialRoute: "/addnewwallet" });
    const buttons = screen.getAllByRole("button");
    const closeIdx = buttons.findIndex((b) => /^close$/i.test(b.textContent ?? ""));
    const actionIdx = buttons.findIndex((b) => /create wallet/i.test(b.textContent ?? ""));
    expect(closeIdx).toBeLessThan(actionIdx);
  });
});
