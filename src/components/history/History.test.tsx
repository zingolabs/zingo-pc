import React from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "../../test-utils";
import {
  AddressBookEntryClass,
  TotalBalanceClass,
  ValueTransferClass,
  ValueTransferKindEnum,
  ValueTransferStatusEnum,
  ServerChainNameEnum,
} from "../appstate";

jest.mock("../../electronBridge");

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
  it("carries the active server line in the balance header", () => {
    render(<History />, {
      contextOverrides: {
        currentWallet: { id: 0, uri: "https://zec.rocks:443", selection: "auto" } as never,
      },
    });
    expect(screen.getByRole("button", { name: "Active server health" })).toBeInTheDocument();
  });
});
