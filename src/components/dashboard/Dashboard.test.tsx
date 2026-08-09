import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "../../test-utils";
import {
  InfoClass,
  TotalBalanceClass,
  ValueTransferClass,
  ValueTransferKindEnum,
  ValueTransferStatusEnum,
  ServerChainNameEnum,
  SyncStatusScanRangePriorityEnum,
} from "../appstate";
import routes from "../../constants/routes.json";

jest.mock("../../electronBridge");

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => {
  const actual = jest.requireActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Dashboard = require("./Dashboard").default;

const makeWallet = (chain = ServerChainNameEnum.mainChainName) =>
  ({ id: 0, fileName: "z.dat", alias: "w", chain_name: chain }) as any;

const makeBalance = (overrides: Partial<TotalBalanceClass> = {}): TotalBalanceClass => {
  const b = new TotalBalanceClass();
  return Object.assign(b, overrides);
};

const makeInfo = (overrides: Partial<InfoClass> = {}): InfoClass => {
  const i = new InfoClass();
  return Object.assign(
    i,
    {
      serverUri: "https://lightd.example",
      chainName: ServerChainNameEnum.mainChainName,
      version: "1.0",
      zingolib: "0.2",
      latestBlock: 2_500_000,
      currencyName: "ZEC",
      zecPrice: 30,
    },
    overrides,
  );
};

const makeVT = (confirmations: number, amount = 1) =>
  new ValueTransferClass(
    ValueTransferKindEnum.sent,
    confirmations,
    100,
    ValueTransferStatusEnum.confirmed,
    "txid" + amount,
    Math.floor(Date.now() / 1000),
    amount,
    "addr",
  );

beforeEach(() => {
  mockNavigate.mockReset();
});

describe("Dashboard", () => {
  it("renders the 'no wallet' state when currentWallet is null", () => {
    render(<Dashboard navigateToHistory={jest.fn()} />, {
      contextOverrides: { currentWallet: null },
    });
    expect(screen.getByText("There is no wallets added.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add New Wallet/i })).toBeInTheDocument();
  });

  it("navigates to AddNewWallet when 'Add New Wallet' is clicked", () => {
    render(<Dashboard navigateToHistory={jest.fn()} />, {
      contextOverrides: { currentWallet: null },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add New Wallet/i }));
    expect(mockNavigate).toHaveBeenCalledWith(routes.ADDNEWWALLET, { state: { mode: "addnew" } });
  });

  it("shows wallet open error state with Settings and Delete buttons", () => {
    render(<Dashboard navigateToHistory={jest.fn()} />, {
      contextOverrides: { currentWalletOpenError: "Bad password", currentWallet: makeWallet() },
    });
    expect(screen.getByText(/Error Opening the current Wallet: Bad password/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Wallet Settings/i }));
    expect(mockNavigate).toHaveBeenCalledWith(routes.ADDNEWWALLET, { state: { mode: "settings" } });
    fireEvent.click(screen.getByRole("button", { name: /Delete Wallet/i }));
    expect(mockNavigate).toHaveBeenCalledWith(routes.ADDNEWWALLET, { state: { mode: "delete" } });
  });

  it("renders the 'no transactions' placeholder", () => {
    render(<Dashboard navigateToHistory={jest.fn()} />, {
      contextOverrides: { currentWallet: makeWallet(), valueTransfers: [], info: makeInfo() },
    });
    expect(screen.getByText("No Transactions Yet")).toBeInTheDocument();
  });

  it("renders up to 5 detail lines and a 'See more' button when there are value transfers", () => {
    const navigateToHistory = jest.fn();
    const vts = [makeVT(5, 1), makeVT(5, 2), makeVT(5, 3), makeVT(5, 4), makeVT(5, 5), makeVT(5, 6)];
    render(<Dashboard navigateToHistory={navigateToHistory} />, {
      contextOverrides: { currentWallet: makeWallet(), valueTransfers: vts, info: makeInfo() },
    });
    expect(screen.getByText("Last transactions")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /See more.../ }));
    expect(navigateToHistory).toHaveBeenCalled();
  });

  // The line renders off currentWallet.uri, so a wallet without one hides it —
  // which is why the rest of these fixtures never noticed it.
  it("shows the active server line above the balances", () => {
    render(<Dashboard navigateToHistory={jest.fn()} />, {
      contextOverrides: {
        currentWallet: { ...makeWallet(), uri: "https://zec.rocks:443", selection: "auto" } as any,
        info: makeInfo(),
      },
    });
    expect(screen.getByRole("button", { name: "Active server health" })).toBeInTheDocument();
  });

  it("shows the server info block", () => {
    render(<Dashboard navigateToHistory={jest.fn()} />, {
      contextOverrides: {
        currentWallet: makeWallet(),
        info: makeInfo({ serverUri: "https://lightd.example", chainName: ServerChainNameEnum.mainChainName }),
      },
    });
    expect(screen.getByText("Server info")).toBeInTheDocument();
    // Twice now: the health line above the balances shows it too.
    expect(screen.getAllByText("https://lightd.example").length).toBeGreaterThan(0);
    expect(screen.getByText("Mainnet")).toBeInTheDocument();
  });

  it("hides ZEC Price when currency is not ZEC", () => {
    render(<Dashboard navigateToHistory={jest.fn()} />, {
      contextOverrides: {
        currentWallet: makeWallet(),
        info: makeInfo({ currencyName: "" }),
      },
    });
    expect(screen.queryByText(/ZEC Price/)).not.toBeInTheDocument();
  });

  it("shows the Shield Transparent button when conditions are met", async () => {
    const calculateShieldFee = jest.fn().mockResolvedValue(0.0001);
    const handleShieldButton = jest.fn();
    render(<Dashboard navigateToHistory={jest.fn()} />, {
      contextOverrides: {
        currentWallet: makeWallet(),
        info: makeInfo(),
        totalBalance: makeBalance({ confirmedTransparentBalance: 1, totalTransparentBalance: 1 }),
        calculateShieldFee,
        handleShieldButton,
      },
    });
    await waitFor(() => expect(calculateShieldFee).toHaveBeenCalled());
    const btn = await screen.findByRole("button", { name: /Shield Transparent Balance To Orchard/ });
    fireEvent.click(btn);
    expect(handleShieldButton).toHaveBeenCalled();
  });

  it("does NOT compute shield fee when readOnly is true", () => {
    const calculateShieldFee = jest.fn().mockResolvedValue(0.0001);
    render(<Dashboard navigateToHistory={jest.fn()} />, {
      contextOverrides: {
        currentWallet: makeWallet(),
        info: makeInfo(),
        totalBalance: makeBalance({ confirmedTransparentBalance: 1 }),
        calculateShieldFee,
        readOnly: true,
      },
    });
    expect(calculateShieldFee).not.toHaveBeenCalled();
  });

  it("shows pending warning when any value transfer has 0..3 confirmations", () => {
    render(<Dashboard navigateToHistory={jest.fn()} />, {
      contextOverrides: {
        currentWallet: makeWallet(),
        valueTransfers: [makeVT(1, 1)],
        info: makeInfo(),
      },
    });
    expect(screen.getByText(/Some transactions are pending/)).toBeInTheDocument();
  });

  it("shows fetch error banner", () => {
    render(<Dashboard navigateToHistory={jest.fn()} />, {
      contextOverrides: {
        currentWallet: makeWallet(),
        info: makeInfo(),
        fetchError: { command: "info", error: "down" } as any,
      },
    });
    expect(screen.getByText("info: down")).toBeInTheDocument();
  });

  it("hides Orchard/Sapling/Transparent blocks when the corresponding pool flag is false", () => {
    render(<Dashboard navigateToHistory={jest.fn()} />, {
      contextOverrides: {
        currentWallet: makeWallet(),
        info: makeInfo(),
        orchardPool: false,
        saplingPool: false,
        transparentPool: false,
      },
    });
    expect(screen.queryByText("Orchard")).not.toBeInTheDocument();
    expect(screen.queryByText("Sapling")).not.toBeInTheDocument();
    expect(screen.queryByText("Transparent")).not.toBeInTheDocument();
  });

  it("renders sync scan range bars with all priority colors", () => {
    const ranges = [
      SyncStatusScanRangePriorityEnum.Scanning,
      SyncStatusScanRangePriorityEnum.RefetchingNullifiers,
      SyncStatusScanRangePriorityEnum.Scanned,
      SyncStatusScanRangePriorityEnum.ScannedWithoutMapping,
      SyncStatusScanRangePriorityEnum.Historic,
      SyncStatusScanRangePriorityEnum.OpenAdjacent,
      SyncStatusScanRangePriorityEnum.FoundNote,
      SyncStatusScanRangePriorityEnum.ChainTip,
      SyncStatusScanRangePriorityEnum.Verify,
    ].map((priority, idx) => ({
      start_block: 100 + idx * 10,
      end_block: 110 + idx * 10,
      priority,
    }));
    render(<Dashboard navigateToHistory={jest.fn()} />, {
      contextOverrides: {
        currentWallet: makeWallet(),
        info: makeInfo(),
        birthday: 100,
        syncingStatus: { scan_ranges: ranges } as any,
      },
    });
    expect(screen.getByText("Nonlinear Scanning Map")).toBeInTheDocument();
    expect(screen.getByText("Scanned")).toBeInTheDocument();
    expect(screen.getByText("Scanning...")).toBeInTheDocument();
    expect(screen.getByText("Refetching spends...")).toBeInTheDocument();
    expect(screen.getByText("Low Priority")).toBeInTheDocument();
    expect(screen.getByText("High Priority")).toBeInTheDocument();
  });

  it("renders sync scan range bar with unknown priority (falls into red branch)", () => {
    render(<Dashboard navigateToHistory={jest.fn()} />, {
      contextOverrides: {
        currentWallet: makeWallet(),
        info: makeInfo(),
        birthday: 100,
        syncingStatus: {
          scan_ranges: [{ start_block: 100, end_block: 110, priority: "bogus-priority" as any }] as any,
        } as any,
      },
    });
    expect(screen.getByText("Nonlinear Scanning Map")).toBeInTheDocument();
  });
});
