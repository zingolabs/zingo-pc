import React from "react";
import { fireEvent, screen, within } from "@testing-library/react";
import { render } from "../../test-utils";
import AddNewWallet from "./AddNewWallet";
import { ipcRenderer } from "../../electronBridge";
import fetchServerList from "../../utils/fetchServerList";
import { ServerChainNameEnum, ServerClass } from "../appstate";

jest.mock("../../electronBridge");
jest.mock("../../utils/fetchServerList");

const mockSettings = { serveruri: "", serverchain_name: "main", serverselection: "" };

const liveList = fetchServerList as jest.MockedFunction<typeof fetchServerList>;

const liveServer = (uri: string, chain = ServerChainNameEnum.mainChainName): ServerClass => ({
  uri,
  chain_name: chain,
  latency: null,
  default: false,
  obsolete: false,
});

beforeEach(() => {
  (ipcRenderer.invoke as jest.Mock).mockResolvedValue(mockSettings);
  liveList.mockReset().mockResolvedValue([]);
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

  it("shows Cancel button before action button", () => {
    render(<AddNewWallet {...baseProps} />, { initialRoute: "/addnewwallet" });
    const buttons = screen.getAllByRole("button");
    const cancelIdx = buttons.findIndex((b) => /^cancel$/i.test(b.textContent ?? ""));
    const actionIdx = buttons.findIndex((b) => /create wallet/i.test(b.textContent ?? ""));
    expect(cancelIdx).toBeLessThan(actionIdx);
  });
});

describe("AddNewWallet server picker", () => {
  // The server block only appears once the settings read has resolved a chain.
  const openPicker = async () => {
    render(<AddNewWallet {...baseProps} />, { initialRoute: "/addnewwallet" });
    fireEvent.click((await screen.findAllByText("Selected Server"))[0]);
    return screen.findByLabelText("Server list");
  };

  it("offers the registry's servers when it answers", async () => {
    liveList.mockImplementation(async (chain) =>
      chain === ServerChainNameEnum.mainChainName ? [liveServer("https://one.zec.rocks:443")] : [],
    );

    const select = await openPicker();

    expect(await within(select).findByRole("option", { name: /one\.zec\.rocks/ })).toBeInTheDocument();
    // the static mainnet entries gave way to the live ones
    expect(within(select).queryByRole("option", { name: /na\.zec\.rocks/ })).toBeNull();
  });

  it("keeps the static list for a chain the registry says nothing about", async () => {
    const select = await openPicker();

    expect(await within(select).findByRole("option", { name: "https://zec.rocks:443 - Mainnet" })).toBeInTheDocument();
  });

  it("labels an entry with its URI and chain", async () => {
    liveList.mockImplementation(async (chain) =>
      chain === ServerChainNameEnum.mainChainName ? [liveServer("https://one.zec.rocks:443")] : [],
    );

    const select = await openPicker();
    const option = await within(select).findByRole("option", { name: /one\.zec\.rocks/ });

    expect(option.textContent).toBe("https://one.zec.rocks:443 - Mainnet");
  });
});
