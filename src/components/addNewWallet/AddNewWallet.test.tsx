import React from "react";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { render } from "../../test-utils";
import AddNewWallet from "./AddNewWallet";
import { ipcRenderer, native } from "../../electronBridge";
import fetchServerList from "../../utils/fetchServerList";
import { CreationTypeEnum, ServerChainNameEnum, ServerClass } from "../appstate";
import { SwapStore, readCurrentWalletFingerprint } from "../../swap";
import { useSwapService } from "../../context/ContextSwapService";

jest.mock("../../electronBridge");
jest.mock("../../utils/fetchServerList");
jest.mock("../../rpc/rpc", () => ({ __esModule: true, default: { deinitialize: jest.fn() } }));
// Named rather than automocked: the delete flow only reaches `clearForWallet`
// and the fingerprint read, and a factory keeps the real store — with its
// module-level wallet binding — out of the test entirely.
jest.mock("../../swap", () => ({
  SwapStore: { clearForWallet: jest.fn() },
  readCurrentWalletFingerprint: jest.fn(),
  createSwapService: jest.fn(),
  swapRecordToValueTransfer: jest.fn(),
}));
jest.mock("../../context/ContextSwapService", () => ({ useSwapService: jest.fn() }));

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
  (useSwapService as jest.Mock).mockReturnValue(null);
  (SwapStore.clearForWallet as jest.Mock).mockResolvedValue(undefined);
  (readCurrentWalletFingerprint as jest.Mock).mockResolvedValue(FINGERPRINT);
  (native.wallet_exists as jest.Mock).mockResolvedValue(true);
  (native.stop_sync as jest.Mock).mockResolvedValue("ok");
  (native.delete_wallet as jest.Mock).mockResolvedValue("ok");
});

const FINGERPRINT = "ufvktail16charss";

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

describe("AddNewWallet delete and swap records", () => {
  const walletOfType = (creationType: CreationTypeEnum) =>
    ({
      id: 1,
      alias: "Savings",
      fileName: "zingo-wallet.dat",
      uri: "https://mainnet.example:443",
      chain_name: ServerChainNameEnum.mainChainName,
      creationType,
    }) as never;

  /** Open the delete screen, click through, and accept the confirmation. */
  const confirmDelete = async (creationType: CreationTypeEnum) => {
    const openConfirmModal = jest.fn();
    render(<AddNewWallet {...baseProps} />, {
      initialRoute: { pathname: "/addnewwallet", state: { mode: "delete" } } as never,
      contextOverrides: { currentWallet: walletOfType(creationType), openConfirmModal },
    });

    fireEvent.click(screen.getByRole("button", { name: /^delete wallet$/i }));
    await waitFor(() => expect(openConfirmModal).toHaveBeenCalled());
    // The modal's accept callback is what actually deletes.
    openConfirmModal.mock.calls[0][2]();
    return openConfirmModal;
  };

  // The wallet file goes, so the records that describe swaps made from it have
  // nothing left to belong to.
  it("clears the swap bucket when the wallet file is deleted with the wallet", async () => {
    await confirmDelete(CreationTypeEnum.Seed);

    await waitFor(() => expect(SwapStore.clearForWallet).toHaveBeenCalledWith(FINGERPRINT));
    await waitFor(() => expect(native.delete_wallet).toHaveBeenCalled());
  });

  // A wallet opened from an existing .DAT is not destroyed by this flow — the
  // file stays put and can be opened again. Clearing the bucket would leave
  // that reopened wallet with an empty history for a delete that only ever
  // removed a list entry, so the records stay with the file.
  it("keeps the swap bucket when the wallet was opened from a file left on disk", async () => {
    await confirmDelete(CreationTypeEnum.File);

    await waitFor(() => expect(baseProps.setCurrentWallet).toHaveBeenCalledWith(null));
    expect(SwapStore.clearForWallet).not.toHaveBeenCalled();
    expect(native.delete_wallet).not.toHaveBeenCalled();
  });

  // The in-flight warning tells the user what they lose. For a file-backed
  // wallet that is the tracking, not the record, and saying otherwise would
  // send someone hunting for a seed phrase they do not need.
  it("warns that a file-backed wallet keeps its in-flight swap record", async () => {
    (useSwapService as jest.Mock).mockReturnValue({ hasInflightDeposits: jest.fn().mockResolvedValue(true) });
    const openConfirmModal = jest.fn();
    render(<AddNewWallet {...baseProps} />, {
      initialRoute: { pathname: "/addnewwallet", state: { mode: "delete" } } as never,
      contextOverrides: { currentWallet: walletOfType(CreationTypeEnum.File), openConfirmModal },
    });

    fireEvent.click(screen.getByRole("button", { name: /^delete wallet$/i }));

    await waitFor(() => expect(openConfirmModal).toHaveBeenCalled());
    const body: string = openConfirmModal.mock.calls[0][1];
    expect(body).toContain("open the file again");
    expect(body).not.toContain("seed phrase");
  });

  // The same warning for every other wallet keeps saying what it said.
  it("warns that a seed-backed wallet loses its in-flight swap record", async () => {
    (useSwapService as jest.Mock).mockReturnValue({ hasInflightDeposits: jest.fn().mockResolvedValue(true) });
    const openConfirmModal = jest.fn();
    render(<AddNewWallet {...baseProps} />, {
      initialRoute: { pathname: "/addnewwallet", state: { mode: "delete" } } as never,
      contextOverrides: { currentWallet: walletOfType(CreationTypeEnum.Seed), openConfirmModal },
    });

    fireEvent.click(screen.getByRole("button", { name: /^delete wallet$/i }));

    await waitFor(() => expect(openConfirmModal).toHaveBeenCalled());
    expect(openConfirmModal.mock.calls[0][1]).toContain("removes the record that tracks it");
  });
});
