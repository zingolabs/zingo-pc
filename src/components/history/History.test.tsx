import React from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import dateformat from "dateformat";
import { render } from "../../test-utils";
import {
  AddressBookEntryClass,
  TotalBalanceClass,
  ValueTransferClass,
  ValueTransferKindEnum,
  ValueTransferStatusEnum,
  ServerChainNameEnum,
} from "../appstate";
import { deriveMixnetView } from "../../rpc/components/mixnetPresenter";

jest.mock("../../electronBridge");

// The swap store is read through these hooks. Empty unless a test sets it,
// which is what every test written before swaps expects.
let mockSwapRecords: unknown[] = [];
jest.mock("../../context/ContextSwapService", () => {
  const actual = jest.requireActual("../../context/ContextSwapService");
  const React = jest.requireActual("react");
  const { swapRecordToValueTransfer } = jest.requireActual("../../swap/swapRecordToValueTransfer");
  return {
    ...actual,
    useSwapRecords: () => mockSwapRecords,
    // Memoised like the real hook: a new array every render would feed any
    // effect keyed on the list a change it never had.
    useValueTransfersWithSwaps: (vts: Array<{ time: number }>) =>
      React.useMemo(
        () =>
          ([...vts, ...mockSwapRecords.map(swapRecordToValueTransfer)] as Array<{ time: number }>).sort(
            (x: { time: number }, y: { time: number }) => y.time - x.time,
          ),
        [vts],
      ),
  };
});

afterEach(() => {
  mockSwapRecords = [];
});

jest.mock("./components/VtModal", () => ({
  __esModule: true,
  default: jest.fn(({ modalIsOpen }: { modalIsOpen: boolean }) =>
    modalIsOpen ? <div data-testid="vt-modal-open" /> : null,
  ),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const History = require("./History").default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const VtModalMock = require("./components/VtModal").default as jest.Mock;

beforeEach(() => {
  // resetMocks: true wipes mock implementations between tests; reinstall.
  VtModalMock.mockImplementation(({ modalIsOpen }: { modalIsOpen: boolean }) =>
    modalIsOpen ? <div data-testid="vt-modal-open" /> : null,
  );
});

const makeVt = (overrides: Partial<ValueTransferClass> = {}): ValueTransferClass =>
  Object.assign(
    new ValueTransferClass(
      ValueTransferKindEnum.sent,
      10,
      0,
      ValueTransferStatusEnum.confirmed,
      "abc123txid",
      1_700_000_000,
      0.5,
      "u1shortaddr",
    ),
    overrides,
  );

const makeBalance = (overrides: Partial<TotalBalanceClass> = {}) => Object.assign(new TotalBalanceClass(), overrides);

// Shielding transmits, so the button waits for the mixnet; the default
// context is the fail-closed view.
const READY_MIXNET = deriveMixnetView({ mode: "ready", socks5_addr: "127.0.0.1:1080" });

describe("History", () => {
  it("renders without crashing", () => {
    render(<History />);
  });

  it("renders the 'History' header", () => {
    render(<History />);
    expect(screen.getByText("History")).toBeInTheDocument();
  });

  it("renders 'No Transactions Yet' when there are no value transfers", () => {
    render(<History />);
    expect(screen.getByText("No Transactions Yet")).toBeInTheDocument();
  });

  it("renders a VtItemBlock for each value transfer", () => {
    const vts = [makeVt({ txid: "tx1" }), makeVt({ txid: "tx2", address: "u1other" })];
    render(<History />, { contextOverrides: { valueTransfers: vts } });
    // Each VtItemBlock renders an outer button — there should be 2 outer + inner buttons
    expect(screen.getAllByRole("button").length).toBeGreaterThanOrEqual(2);
  });

  it("shows 'Load more' when there are more than 100 value transfers", () => {
    const vts = Array.from({ length: 150 }, (_, i) => makeVt({ txid: `tx${i}` }));
    render(<History />, { contextOverrides: { valueTransfers: vts } });
    expect(screen.getByRole("button", { name: /Load more/i })).toBeInTheDocument();
  });

  it("loads 100 more transactions when 'Load more' is clicked", async () => {
    const vts = Array.from({ length: 150 }, (_, i) => makeVt({ txid: `tx${i}` }));
    render(<History />, { contextOverrides: { valueTransfers: vts } });
    fireEvent.click(screen.getByRole("button", { name: /Load more/i }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Load more/i })).not.toBeInTheDocument());
  });

  it("opens VtModal when a transaction is clicked", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const VtModalMock = require("./components/VtModal").default as jest.Mock;
    const vt = makeVt({ txid: "tx1" });
    render(<History />, { contextOverrides: { valueTransfers: [vt] } });
    fireEvent.click(screen.getAllByRole("button")[0]);
    await waitFor(() => {
      const lastProps = VtModalMock.mock.calls[VtModalMock.mock.calls.length - 1][0] as { modalIsOpen: boolean };
      expect(lastProps.modalIsOpen).toBe(true);
    });
  });

  it("closes the modal via the VtModal closeModal callback", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const VtModalMock = require("./components/VtModal").default as jest.Mock;
    const vt = makeVt({ txid: "tx1" });
    render(<History />, { contextOverrides: { valueTransfers: [vt] } });
    fireEvent.click(screen.getAllByRole("button")[0]);
    await screen.findByTestId("vt-modal-open");
    const props = VtModalMock.mock.calls[VtModalMock.mock.calls.length - 1][0] as { closeModal: () => void };
    await act(async () => {
      props.closeModal();
    });
    await waitFor(() => expect(screen.queryByTestId("vt-modal-open")).not.toBeInTheDocument());
  });

  it("shows the pending warning when there are unconfirmed transfers", () => {
    const pending = makeVt({ confirmations: 1 });
    render(<History />, { contextOverrides: { valueTransfers: [pending] } });
    expect(screen.getByText(/Some transactions are pending/)).toBeInTheDocument();
  });

  it("shows the Shield button under proper conditions", async () => {
    const calculateShieldFee = jest.fn().mockResolvedValue(0.0001);
    const handleShieldButton = jest.fn();
    render(<History />, {
      contextOverrides: {
        totalBalance: makeBalance({ confirmedTransparentBalance: 1 }),
        calculateShieldFee,
        handleShieldButton,
        mixnetView: READY_MIXNET,
      },
    });
    await waitFor(() => expect(calculateShieldFee).toHaveBeenCalled());
    const btn = await screen.findByRole("button", { name: /Shield Transparent Balance/ });
    fireEvent.click(btn);
    expect(handleShieldButton).toHaveBeenCalled();
  });

  it("hides Shield button when readOnly is true", () => {
    const calculateShieldFee = jest.fn().mockResolvedValue(0.0001);
    render(<History />, {
      contextOverrides: {
        totalBalance: makeBalance({ confirmedTransparentBalance: 1 }),
        calculateShieldFee,
        readOnly: true,
      },
    });
    expect(calculateShieldFee).not.toHaveBeenCalled();
  });

  it("shows fetch error banner", () => {
    render(<History />, {
      contextOverrides: { fetchError: { command: "vt", error: "fail" } as any },
    });
    expect(screen.getByText("vt: fail")).toBeInTheDocument();
  });

  it("hides pool blocks when pool flag is false", () => {
    render(<History />, {
      contextOverrides: { orchardPool: false, saplingPool: false, transparentPool: false },
    });
    expect(screen.queryByText("Orchard")).not.toBeInTheDocument();
  });

  it("builds the address book map for label lookup", () => {
    const vt = makeVt({ address: "u1known" });
    const ab = new AddressBookEntryClass("Charlie", "u1known", ServerChainNameEnum.mainChainName);
    render(<History />, {
      contextOverrides: { valueTransfers: [vt], addressBook: [ab] },
    });
    expect(screen.getByText("Charlie")).toBeInTheDocument();
  });

  // The line rides the balance header, which every one of these pages carries.
});

// A two-transaction outbound deposit refunded hours later, with an unrelated
// transaction in between. Every row is told apart by its address book label.
describe("History grouped by swap", () => {
  const hash = (seed: string) => seed.repeat(32);
  const swapRecord = {
    recordId: "rec-out",
    depositAddress: "t1deposit",
    provider: "FLASHNET",
    direction: "OUTBOUND",
    routeId: "route",
    sellAsset: { swapKitId: "ZEC.ZEC", chain: "ZEC", symbol: "ZEC", ticker: "ZEC", chainId: "zcash", decimals: 8 },
    receiveAsset: { swapKitId: "BTC.BTC", chain: "BTC", symbol: "BTC", ticker: "BTC", chainId: "bitcoin", decimals: 8 },
    sellAmountHumanDecimal: "0.01",
    expectedReceiveAmount: "0.0001",
    minReceiveAmount: "0.00009",
    destinationAddress: "bc1qswap",
    sourceAddress: "t1ephemeral",
    status: "REFUNDED",
    providerData: { kind: "FLASHNET" },
    broadcast: { txId: hash("b2"), allTxIds: [hash("a1"), hash("b2")] },
    observedDepositTxHash: hash("b2"),
    refundInfo: { refundTxHash: hash("c3") },
    fiatValueBasis: { sellUsdUnitPrice: 1, receiveUsdUnitPrice: 1, capturedAt: 0 },
    createdAtMs: 1_000_000,
    updatedAtMs: 1_000_000,
  };
  const labelled = (label: string, address: string) =>
    new AddressBookEntryClass(label, address, ServerChainNameEnum.mainChainName);
  const context = () => ({
    valueTransfers: [
      makeVt({ txid: hash("a1"), time: 1001, address: "t1hop" }),
      makeVt({ txid: hash("b2"), time: 1100, address: "t1depositaddr" }),
      makeVt({ txid: hash("e5"), time: 5000, address: "u1unrelated" }),
      makeVt({ txid: hash("c3"), time: 9000, address: "t1refund", type: ValueTransferKindEnum.received }),
    ],
    addressBook: [
      labelled("Swap", "bc1qswap"),
      labelled("Hop", "t1hop"),
      labelled("Deposit", "t1depositaddr"),
      labelled("Unrelated", "u1unrelated"),
      labelled("Refund", "t1refund"),
    ],
  });
  const order = () => screen.getAllByText(/^(Swap|Hop|Deposit|Unrelated|Refund)$/).map((el) => el.textContent);

  it("offers no toggle to a wallet without swaps", () => {
    render(<History />, { contextOverrides: context() });

    expect(screen.queryByRole("checkbox", { name: "Group by swap" })).not.toBeInTheDocument();
    expect(order()).toEqual(["Refund", "Unrelated", "Deposit", "Hop"]);
  });

  it("groups by swap by default, the swap first and its transactions oldest first", () => {
    mockSwapRecords = [swapRecord];
    render(<History />, { contextOverrides: context() });

    expect(screen.getByRole("checkbox", { name: "Group by swap" })).toBeChecked();
    expect(order()).toEqual(["Unrelated", "Swap", "Hop", "Deposit", "Refund"]);
  });

  it("goes back to time order when the toggle is cleared", () => {
    mockSwapRecords = [swapRecord];
    render(<History />, { contextOverrides: context() });

    fireEvent.click(screen.getByRole("checkbox", { name: "Group by swap" }));

    expect(order()).toEqual(["Refund", "Unrelated", "Deposit", "Hop", "Swap"]);
  });

  // A one-send swap: its row borrows the deposit's txid as a key and sits right
  // next to it. A row that is not joined to the one above carries a date
  // header, so counting headers tells joined rows apart.
  describe("a one-send swap beside its deposit", () => {
    const oneSend = {
      ...swapRecord,
      broadcast: { txId: hash("b2"), allTxIds: [hash("b2")] },
      refundInfo: undefined,
    };
    const render1 = () =>
      render(<History />, {
        contextOverrides: {
          valueTransfers: [makeVt({ txid: hash("b2"), time: 1001, address: "t1depositaddr" })],
          addressBook: context().addressBook,
        },
      });
    const dateHeaders = () => screen.queryAllByText(dateformat(new Date(1001 * 1000), "mmm dd, yyyy"));

    it("does not join them in time order through the borrowed txid", () => {
      mockSwapRecords = [oneSend];
      render1();

      fireEvent.click(screen.getByRole("checkbox", { name: "Group by swap" }));

      expect(dateHeaders()).toHaveLength(2);
    });

    it("joins them while grouping", () => {
      mockSwapRecords = [oneSend];
      render1();

      expect(dateHeaders()).toHaveLength(1);
    });
  });
});

describe("History — search", () => {
  // The longest list in the wallet: a search reaches all of it, not only the
  // hundred rows loaded.
  it("narrows the rows by address, memo or id", () => {
    const vts = [
      makeVt({ txid: "tx-coffee", address: "u1coffee", memos: ["Factura número 34"] }),
      makeVt({ txid: "tx-rent", address: "u1rent", memos: ["alquiler de marzo"] }),
    ];
    render(<History />, { contextOverrides: { valueTransfers: vts } });
    const search = screen.getByRole("searchbox", { name: "Search history" });

    fireEvent.change(search, { target: { value: "numero" } });
    expect(screen.getByText(/Factura número 34/)).toBeInTheDocument();
    expect(screen.queryByText(/alquiler de marzo/)).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "u1rent" } });
    expect(screen.getByText(/alquiler de marzo/)).toBeInTheDocument();
    expect(screen.queryByText(/Factura número 34/)).not.toBeInTheDocument();
  });

  // An empty history and a search that found nothing are different facts.
  it("says a search found nothing, not that there are no transactions", () => {
    render(<History />, { contextOverrides: { valueTransfers: [makeVt({ txid: "tx1" })] } });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search history" }), { target: { value: "zzz" } });
    expect(screen.getByText("No transactions match that.")).toBeInTheDocument();
    expect(screen.queryByText("No Transactions Yet")).not.toBeInTheDocument();
  });

  it("searches past the rows already loaded", () => {
    const vts = [
      makeVt({ txid: "tx-oldest", address: "u1oldest", memos: ["the oldest one"] }),
      ...Array.from({ length: 150 }, (_, i) => makeVt({ txid: `tx${i}` })),
    ];
    render(<History />, { contextOverrides: { valueTransfers: vts } });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search history" }), { target: { value: "oldest" } });
    expect(screen.getByText(/the oldest one/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Load more/i })).not.toBeInTheDocument();
  });
});
