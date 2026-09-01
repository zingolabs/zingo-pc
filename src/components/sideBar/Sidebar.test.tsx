import React from "react";
import { act, cleanup, screen } from "@testing-library/react";
import { render } from "../../test-utils";
import { InfoClass, ServerChainNameEnum } from "../appstate";
import routes from "../../constants/routes.json";

// Stable shared mock surfaces — avoids the auto-mock's per-test reset losing them.
const mockOn = jest.fn();
const mockOff = jest.fn();
const mockInvoke = jest.fn();
const mockGetSeed = jest.fn();
const mockGetUfvk = jest.fn();
jest.mock("../../electronBridge", () => ({
  native: { get_seed: mockGetSeed, get_ufvk: mockGetUfvk },
  ipcRenderer: { on: mockOn, off: mockOff, invoke: mockInvoke, send: jest.fn() },
  clipboard: { writeText: jest.fn() },
  shell: { openExternal: jest.fn() },
  fs: { promises: { readFile: jest.fn(), writeFile: jest.fn() }, existsSync: jest.fn() },
  isSandboxed: false,
}));

// Override parseZcashURI without referencing out-of-scope vars (using the `mock*` prefix exemption).
let mockParseZcashURIImpl: (uri: string, chain?: string) => Promise<any> = async (uri: string) => uri;
jest.mock("../../utils/uris", () => ({
  parseZcashURI: (uri: string, chain?: string) => mockParseZcashURIImpl(uri, chain),
  ZcashURITarget: class {},
}));

const mockNavigate = jest.fn();
const mockLocation = { pathname: "/dashboard" };
jest.mock("react-router-dom", () => {
  const actual = jest.requireActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => mockLocation,
  };
});

// Stub modal children to keep tests focused on Sidebar itself.
jest.mock("./components/PayURIModal", () => ({
  __esModule: true,
  default: jest.fn(() => null),
}));
jest.mock("./components/BlockExplorerModal", () => ({
  __esModule: true,
  default: jest.fn(() => null),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Sidebar = require("./Sidebar").default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PayURIModalMock = require("./components/PayURIModal").default as jest.Mock;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const BlockExplorerModalMock = require("./components/BlockExplorerModal").default as jest.Mock;

const lastPayURIModalProps = (): any => {
  const calls = PayURIModalMock.mock.calls;
  return calls.length ? calls[calls.length - 1][0] : undefined;
};
const lastBlockExplorerModalProps = (): any => {
  const calls = BlockExplorerModalMock.mock.calls;
  return calls.length ? calls[calls.length - 1][0] : undefined;
};

// Fetch listeners from mockOn.mock.calls (last registration per channel wins).
const getListener = (channel: string): ((...args: any[]) => any) | undefined => {
  for (let i = mockOn.mock.calls.length - 1; i >= 0; i--) {
    if (mockOn.mock.calls[i][0] === channel) return mockOn.mock.calls[i][1];
  }
  return undefined;
};
const installIpcCapture = () => {
  mockInvoke.mockResolvedValue(null);
};

const makeWallet = (chain = ServerChainNameEnum.mainChainName) =>
  ({ id: 1, fileName: "z.dat", alias: "w", chain_name: chain }) as any;

const renderSidebar = (overrides: any = {}) => {
  return render(
    <Sidebar doRescan={jest.fn()} navigateToLoadingScreenChangingWallet={jest.fn()} setBlockExplorer={jest.fn()} />,
    { contextOverrides: { currentWallet: makeWallet(), info: new InfoClass(), ...overrides } },
  );
};

beforeEach(() => {
  cleanup();
  mockNavigate.mockReset();
  PayURIModalMock.mockImplementation(() => null);
  BlockExplorerModalMock.mockImplementation(() => null);
  installIpcCapture();
  mockParseZcashURIImpl = async (uri: string) => uri;
});

describe("Sidebar", () => {
  describe("connection status", () => {
    it("shows DISCONNECTED when latestBlock is 0", () => {
      renderSidebar({ info: Object.assign(new InfoClass(), { latestBlock: 0 }) });
      expect(screen.getByText(/Not Connected/i)).toBeInTheDocument();
    });

    it("shows CONNECTING when latestBlock is set but no verificationProgress", () => {
      renderSidebar({ info: Object.assign(new InfoClass(), { latestBlock: 100 }), verificationProgress: null });
      expect(screen.getByText(/Connecting\.\.\./i)).toBeInTheDocument();
    });

    it("shows SYNCING when verificationProgress < 100", () => {
      renderSidebar({ info: Object.assign(new InfoClass(), { latestBlock: 100 }), verificationProgress: 42 });
      expect(screen.getByText("Syncing")).toBeInTheDocument();
      expect(screen.getByText("42%")).toBeInTheDocument();
    });

    it("shows CONNECTED with green check when walletHeight matches latestBlock", () => {
      renderSidebar({
        info: Object.assign(new InfoClass(), { latestBlock: 100, walletHeight: 100 }),
        verificationProgress: 100,
      });
      expect(screen.getByText(/100/)).toBeInTheDocument();
    });

    it("shows CONNECTED with yellow check and 'blocks behind' when walletHeight lags", () => {
      renderSidebar({
        info: Object.assign(new InfoClass(), { latestBlock: 100, walletHeight: 90 }),
        verificationProgress: 100,
      });
      expect(screen.getByText(/10 blocks behind/)).toBeInTheDocument();
    });
  });

  describe("menu visibility", () => {
    it("hides Send when readOnly is true", () => {
      renderSidebar({ readOnly: true });
      expect(screen.queryByText("Send")).not.toBeInTheDocument();
    });

    it("hides Receive/History/Messages/Insight when no current wallet", () => {
      renderSidebar({ currentWallet: null });
      expect(screen.queryByText("Receive")).not.toBeInTheDocument();
      expect(screen.queryByText("History")).not.toBeInTheDocument();
      expect(screen.queryByText("Messages")).not.toBeInTheDocument();
      expect(screen.queryByText("Financial Insight")).not.toBeInTheDocument();
    });

    it("hides wallet-dependent items when currentWalletOpenError is set", () => {
      renderSidebar({ currentWalletOpenError: "boom" });
      expect(screen.queryByText("Send")).not.toBeInTheDocument();
      expect(screen.queryByText("Receive")).not.toBeInTheDocument();
    });
  });

  describe("IPC menu handlers", () => {
    it("'about' opens the about modal", () => {
      const openErrorModal = jest.fn();
      renderSidebar({ openErrorModal });
      act(() => getListener("about")?.({}));
      expect(openErrorModal).toHaveBeenCalledWith("Zingo PC", expect.anything());
    });

    it("'payuri' with empty uri opens the PayURI modal", () => {
      renderSidebar();
      act(() => getListener("payuri")?.({}, ""));
      // PayURIModal is re-rendered after openPayURIModal sets state; latest props show modalIsOpen=true.
      expect(lastPayURIModalProps()?.modalIsOpen).toBe(true);
    });

    it("'payuri' with no wallet shows error", () => {
      const openErrorModal = jest.fn();
      renderSidebar({ openErrorModal, currentWallet: null, wallets: [] });
      act(() => getListener("payuri")?.({}, "zcash:abc"));
      expect(openErrorModal).toHaveBeenCalledWith("Pay URI", expect.stringContaining("No wallet configured"));
    });

    it("'payuri' on a watch-only wallet shows error", () => {
      const openErrorModal = jest.fn();
      renderSidebar({ openErrorModal, readOnly: true });
      act(() => getListener("payuri")?.({}, "zcash:abc"));
      expect(openErrorModal).toHaveBeenCalledWith("Pay URI", expect.stringContaining("watch-only"));
    });

    it("'payuri' with valid wallet calls payURI which navigates to /send", async () => {
      const setSendTo = jest.fn();
      renderSidebar({ setSendTo });
      mockParseZcashURIImpl = async () => "u1resolved";
      await act(async () => {
        getListener("payuri")?.({}, "zcash:u1resolved");
        await Promise.resolve();
      });
      expect(setSendTo).toHaveBeenCalledWith({ address: "u1resolved" });
      expect(mockNavigate).toHaveBeenCalledWith(routes.SEND);
    });

    it("'payuri' surfaces parse errors", async () => {
      const openErrorModal = jest.fn();
      renderSidebar({ openErrorModal });
      mockParseZcashURIImpl = async () => "Error: malformed";
      await act(async () => {
        getListener("payuri")?.({}, "zcash:weird");
        await Promise.resolve();
      });
      expect(openErrorModal).toHaveBeenCalledWith("URI Error", expect.anything());
    });

    it("'payuri' calls setSendTo when parser returns an object", async () => {
      const setSendTo = jest.fn();
      renderSidebar({ setSendTo });
      mockParseZcashURIImpl = async () => ({ address: "u1foo", amount: 2 });
      await act(async () => {
        getListener("payuri")?.({}, "zcash:u1foo?amount=2");
        await Promise.resolve();
      });
      expect(setSendTo).toHaveBeenCalledWith({ address: "u1foo", amount: 2 });
    });

    it("'blockexplorer' opens the block explorer modal", () => {
      renderSidebar();
      act(() => getListener("blockexplorer")?.({}));
      expect(lastBlockExplorerModalProps()?.modalIsOpen).toBe(true);
    });

    it("'seed' shows error when no current wallet", async () => {
      const openErrorModal = jest.fn();
      renderSidebar({ openErrorModal, currentWallet: null });
      await act(async () => {
        await getListener("seed")?.({});
      });
      expect(openErrorModal).toHaveBeenCalledWith("Wallet Seed Phrase/Viewing Key", expect.any(String));
    });

    it("'seed' displays the seed phrase for a normal wallet", async () => {
      const openErrorModal = jest.fn();
      mockGetSeed.mockResolvedValue(JSON.stringify({ seed_phrase: "word1 word2 word3" }));
      renderSidebar({ openErrorModal });
      await act(async () => {
        await getListener("seed")?.({});
      });
      expect(openErrorModal).toHaveBeenCalled();
      expect(openErrorModal.mock.calls[0][0]).toBe("Wallet Seed Phrase / Viewing Key");
    });

    it("'seed' displays the ufvk for a read-only wallet", async () => {
      const openErrorModal = jest.fn();
      mockGetUfvk.mockResolvedValue(JSON.stringify({ ufvk: "uview1xyz" }));
      renderSidebar({ openErrorModal, readOnly: true });
      await act(async () => {
        await getListener("seed")?.({});
      });
      expect(mockGetUfvk).toHaveBeenCalled();
    });

    it("'seed' on a normal wallet also fetches the UFVK so users can share view-only access", async () => {
      const openErrorModal = jest.fn();
      mockGetSeed.mockResolvedValue(JSON.stringify({ seed_phrase: "abandon ability …" }));
      mockGetUfvk.mockResolvedValue(JSON.stringify({ ufvk: "uview1abc" }));
      renderSidebar({ openErrorModal });
      await act(async () => {
        await getListener("seed")?.({});
      });
      expect(mockGetSeed).toHaveBeenCalled();
      expect(mockGetUfvk).toHaveBeenCalled();
    });

    it("'rescan' delegates to doRescan when wallet is loaded", async () => {
      const doRescan = jest.fn();
      render(
        <Sidebar doRescan={doRescan} navigateToLoadingScreenChangingWallet={jest.fn()} setBlockExplorer={jest.fn()} />,
        { contextOverrides: { currentWallet: makeWallet() } },
      );
      await act(async () => {
        await getListener("rescan")?.({});
      });
      expect(doRescan).toHaveBeenCalled();
    });

    it("'rescan' shows error without a current wallet", async () => {
      const openErrorModal = jest.fn();
      renderSidebar({ openErrorModal, currentWallet: null });
      await act(async () => {
        await getListener("rescan")?.({});
      });
      expect(openErrorModal).toHaveBeenCalledWith("Rescan Wallet", expect.any(String));
    });

    it("'addnewwallet' navigates", () => {
      renderSidebar();
      act(() => getListener("addnewwallet")?.({}));
      expect(mockNavigate).toHaveBeenCalledWith(routes.ADDNEWWALLET, { state: { mode: "addnew" } });
    });

    it("'settingswallet' navigates to settings mode when wallet is loaded", () => {
      renderSidebar();
      act(() => getListener("settingswallet")?.({}));
      expect(mockNavigate).toHaveBeenCalledWith(routes.ADDNEWWALLET, { state: { mode: "settings" } });
    });

    it("'settingswallet' shows error without a current wallet", () => {
      const openErrorModal = jest.fn();
      renderSidebar({ openErrorModal, currentWallet: null });
      act(() => getListener("settingswallet")?.({}));
      expect(openErrorModal).toHaveBeenCalledWith("Wallet Settings", expect.any(String));
    });

    it("'deletewallet' navigates to delete mode when wallet is loaded", () => {
      renderSidebar();
      act(() => getListener("deletewallet")?.({}));
      expect(mockNavigate).toHaveBeenCalledWith(routes.ADDNEWWALLET, { state: { mode: "delete" } });
    });

    it("'deletewallet' shows error without a current wallet", () => {
      const openErrorModal = jest.fn();
      renderSidebar({ openErrorModal, currentWallet: null });
      act(() => getListener("deletewallet")?.({}));
      expect(openErrorModal).toHaveBeenCalledWith("Delete Wallet", expect.any(String));
    });
  });

  describe("pending URI on cold start", () => {
    it("consumes get-pending-uri once wallet is ready", async () => {
      mockInvoke.mockResolvedValue("zcash:u1pending");
      const setSendTo = jest.fn();
      renderSidebar({ setSendTo });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(mockInvoke).toHaveBeenCalledWith("get-pending-uri");
    });

    it("opens 'No wallet configured' when noWallets state triggers a pending URI", async () => {
      const openErrorModal = jest.fn();
      mockInvoke.mockResolvedValue("zcash:u1pending");
      renderSidebar({ openErrorModal, currentWallet: null, wallets: [] });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(openErrorModal).toHaveBeenCalledWith("Pay URI", expect.stringContaining("No wallet configured"));
    });

    it("opens 'watch-only' message when read-only wallet triggers a pending URI", async () => {
      const openErrorModal = jest.fn();
      mockInvoke.mockResolvedValue("zcash:u1pending");
      renderSidebar({ openErrorModal, readOnly: true });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(openErrorModal).toHaveBeenCalledWith("Pay URI", expect.stringContaining("watch-only"));
    });
  });
});
