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

// Stub the heavy VtModal — it's tested independently.
jest.mock("../history/components/VtModal", () => ({
  __esModule: true,
  default: jest.fn(({ modalIsOpen }: { modalIsOpen: boolean }) =>
    modalIsOpen ? <div data-testid="vt-modal-open" /> : null,
  ),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Messages = require("./Messages").default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const VtModalMock = require("../history/components/VtModal").default as jest.Mock;

beforeEach(() => {
  VtModalMock.mockImplementation(({ modalIsOpen }: { modalIsOpen: boolean }) =>
    modalIsOpen ? <div data-testid="vt-modal-open" /> : null,
  );
});

const makeVt = (overrides: Partial<ValueTransferClass> = {}): ValueTransferClass =>
  Object.assign(
    new ValueTransferClass(
      ValueTransferKindEnum.received,
      10,
      0,
      ValueTransferStatusEnum.confirmed,
      "abc123txid",
      1_700_000_000,
      0.5,
      "u1shortaddr",
    ),
    { memos: ["Hello, world!"], ...overrides },
  );

const makeBalance = (overrides: Partial<TotalBalanceClass> = {}) => Object.assign(new TotalBalanceClass(), overrides);

describe("Messages", () => {
  it("renders without crashing", () => {
    render(<Messages />);
  });

  it("renders 'No Transactions Yet' when there are no messages", () => {
    render(<Messages />);
    expect(screen.getByText("No Transactions Yet")).toBeInTheDocument();
  });

  it("renders a message bubble for each message with memos", () => {
    const vts = [makeVt({ txid: "tx1" }), makeVt({ txid: "tx2" })];
    render(<Messages />, { contextOverrides: { messages: vts } });
    // Both bubbles render — the memo is "Hello, world!"
    expect(screen.getAllByText("Hello, world!")).toHaveLength(2);
  });

  it("filters out messages with no memo content", () => {
    const valid = makeVt({ txid: "tx1", memos: ["Yo"] });
    const empty = makeVt({ txid: "tx2", memos: [] });
    render(<Messages />, { contextOverrides: { messages: [valid, empty] } });
    expect(screen.getAllByText("Yo")).toHaveLength(1);
  });

  it("opens the modal when a message bubble is clicked", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const VtModalMock = require("../history/components/VtModal").default as jest.Mock;
    const vt = makeVt({ txid: "tx1" });
    render(<Messages />, { contextOverrides: { messages: [vt] } });
    // The outer message bubble has role="button". The inner address bubble is also
    // role=button. Either click bubbles into the outer handler.
    fireEvent.click(screen.getAllByRole("button")[0]);
    await waitFor(() => {
      const lastProps = VtModalMock.mock.calls[VtModalMock.mock.calls.length - 1][0] as { modalIsOpen: boolean };
      expect(lastProps.modalIsOpen).toBe(true);
    });
  });

  it("hides 'Load more' when there are <= 100 messages", () => {
    const vts = Array.from({ length: 50 }, (_, i) => makeVt({ txid: `tx${i}` }));
    render(<Messages />, { contextOverrides: { messages: vts } });
    expect(screen.queryByRole("button", { name: /Load more/i })).not.toBeInTheDocument();
  });

  it("shows 'Load more' when there are more than 100 messages, and clicking increments", async () => {
    const vts = Array.from({ length: 150 }, (_, i) => makeVt({ txid: `tx${i}` }));
    render(<Messages />, { contextOverrides: { messages: vts } });
    const btn = await screen.findByRole("button", { name: /Load more/i });
    fireEvent.click(btn);
    // After clicking, all 150 are shown so Load more should disappear.
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Load more/i })).not.toBeInTheDocument();
    });
  });

  it("shows the pending warning when there are unconfirmed transfers", () => {
    const pending = new ValueTransferClass(
      ValueTransferKindEnum.sent,
      1,
      100,
      ValueTransferStatusEnum.confirmed,
      "txp",
      0,
      0.1,
      "addrp",
    );
    render(<Messages />, { contextOverrides: { valueTransfers: [pending] } });
    expect(screen.getByText(/Some transactions are pending/)).toBeInTheDocument();
  });

  it("shows fetch error banner", () => {
    render(<Messages />, {
      contextOverrides: { fetchError: { command: "msg", error: "fail" } as any },
    });
    expect(screen.getByText("msg: fail")).toBeInTheDocument();
  });

  it("shows Shield button when conditions are met and clicks invoke handleShieldButton", async () => {
    const calculateShieldFee = jest.fn().mockResolvedValue(0.0001);
    const handleShieldButton = jest.fn();
    render(<Messages />, {
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

  it("does NOT compute shield fee when readOnly is true", () => {
    const calculateShieldFee = jest.fn().mockResolvedValue(0.0001);
    render(<Messages />, {
      contextOverrides: {
        totalBalance: makeBalance({ confirmedTransparentBalance: 1 }),
        calculateShieldFee,
        readOnly: true,
      },
    });
    expect(calculateShieldFee).not.toHaveBeenCalled();
  });

  it("hides Orchard/Sapling/Transparent blocks when pool flag is false", () => {
    render(<Messages />, {
      contextOverrides: { orchardPool: false, saplingPool: false, transparentPool: false },
    });
    expect(screen.queryByText("Orchard")).not.toBeInTheDocument();
    expect(screen.queryByText("Sapling")).not.toBeInTheDocument();
    expect(screen.queryByText("Transparent")).not.toBeInTheDocument();
  });

  it("builds the address book map for label lookup", () => {
    const vt = makeVt({ address: "u1known" });
    const ab = new AddressBookEntryClass("BobLabel", "u1known", ServerChainNameEnum.mainChainName);
    render(<Messages />, {
      contextOverrides: { messages: [vt], addressBook: [ab] },
    });
    expect(screen.getByText("BobLabel")).toBeInTheDocument();
  });

  it("closes the modal via the VtModal closeModal callback", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const VtModalMock = require("../history/components/VtModal").default as jest.Mock;
    const vt = makeVt({ txid: "tx1" });
    render(<Messages />, { contextOverrides: { messages: [vt] } });
    fireEvent.click(screen.getAllByRole("button")[0]);
    await waitFor(() => {
      const lastProps = VtModalMock.mock.calls[VtModalMock.mock.calls.length - 1][0] as { modalIsOpen: boolean };
      expect(lastProps.modalIsOpen).toBe(true);
    });
    const props = VtModalMock.mock.calls[VtModalMock.mock.calls.length - 1][0] as { closeModal: () => void };
    await act(async () => {
      props.closeModal();
    });
    // After closeModal, Messages conditionally unmounts VtModal — so the stub disappears.
    await waitFor(() => expect(screen.queryByTestId("vt-modal-open")).not.toBeInTheDocument());
  });

  // The line rides the balance header, which every one of these pages carries.
  it("carries the active server line in the balance header", () => {
    render(<Messages />, {
      contextOverrides: {
        currentWallet: { id: 0, uri: "https://zec.rocks:443", selection: "auto" } as never,
      },
    });
    expect(screen.getByRole("button", { name: "Active server health" })).toBeInTheDocument();
  });
});
