import React from "react";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
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

describe("AddNewWallet automatic server", () => {
  // The block starts collapsed, and only appears once the settings read has
  // resolved a chain — so opening it is an await, as it is for the picker above.
  const openServerBlock = async () => fireEvent.click((await screen.findAllByText("Selected Server"))[0]);

  // It was hidden outside settings, so a new wallet could never be created on
  // Automatic — even though the code stored exactly that when nothing was
  // picked, and the validation then refused to let that happen.
  it("offers Automatic while creating a wallet", async () => {
    render(<AddNewWallet {...baseProps} />, { initialRoute: "/addnewwallet" });
    await openServerBlock();

    expect(screen.getByRole("radio", { name: "Automatic" })).toBeInTheDocument();
  });

  // The case that needed care. `init_new` dials the chosen server to build the
  // wallet, so Automatic has to resolve one for the chain being created —
  // never the app's saved URI, which belongs to whatever chain it was last on.
  it("resolves a server for the chain being created, not the one last used", async () => {
    liveList.mockResolvedValue([liveServer("https://testnet.example:443", ServerChainNameEnum.testChainName)]);
    render(<AddNewWallet {...baseProps} />, { initialRoute: "/addnewwallet" });
    await openServerBlock();

    fireEvent.change(screen.getByRole("combobox", { name: /network/i }), {
      target: { value: ServerChainNameEnum.testChainName },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Automatic" }));

    await waitFor(() => expect(liveList).toHaveBeenCalledWith(ServerChainNameEnum.testChainName));
  });

  // Changing the chain afterwards has to re-resolve. Automatic says how to
  // pick, not which server, so it survives the change — and the server it
  // resolved for the previous chain must not.
  it("re-resolves when the chain changes underneath it", async () => {
    liveList.mockResolvedValue([liveServer("https://mainnet.example:443")]);
    render(<AddNewWallet {...baseProps} />, { initialRoute: "/addnewwallet" });
    await openServerBlock();

    fireEvent.change(screen.getByRole("combobox", { name: /network/i }), {
      target: { value: ServerChainNameEnum.mainChainName },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Automatic" }));
    await waitFor(() => expect(liveList).toHaveBeenCalledWith(ServerChainNameEnum.mainChainName));

    liveList.mockClear();
    fireEvent.change(screen.getByRole("combobox", { name: /network/i }), {
      target: { value: ServerChainNameEnum.testChainName },
    });

    await waitFor(() => expect(liveList).toHaveBeenCalledWith(ServerChainNameEnum.testChainName));
  });
});

describe("AddNewWallet delete confirmation", () => {
  const wallet = {
    id: 1,
    alias: "Savings",
    fileName: "zingo-wallet.dat",
    chain_name: ServerChainNameEnum.mainChainName,
  } as never;

  // Deleting removes the wallet file, and until now the only thing between a
  // click and that was the screen the button sits on. The in-flight-swap
  // confirmation existed, but only when a swap was in flight.
  it("asks before deleting, naming the wallet", async () => {
    const openConfirmModal = jest.fn();
    render(<AddNewWallet {...baseProps} />, {
      initialRoute: { pathname: "/addnewwallet", state: { mode: "delete" } } as never,
      contextOverrides: { currentWallet: wallet, openConfirmModal },
    });

    fireEvent.click(screen.getByRole("button", { name: /^delete wallet$/i }));

    await waitFor(() => expect(openConfirmModal).toHaveBeenCalled());
    expect(openConfirmModal.mock.calls[0][1]).toContain("Savings");
  });

  // The confirmation is a question, so declining it has to leave the wallet
  // alone — the action only runs from the callback the modal invokes.
  it("does nothing until the confirmation is accepted", async () => {
    const openConfirmModal = jest.fn();
    render(<AddNewWallet {...baseProps} />, {
      initialRoute: { pathname: "/addnewwallet", state: { mode: "delete" } } as never,
      contextOverrides: { currentWallet: wallet, openConfirmModal },
    });

    fireEvent.click(screen.getByRole("button", { name: /^delete wallet$/i }));

    await waitFor(() => expect(openConfirmModal).toHaveBeenCalled());
    expect(baseProps.clearTimers).not.toHaveBeenCalled();
  });
});
