import React, { useContext, useState } from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "../../test-utils";
import {
  AddressKindEnum,
  TotalBalanceClass,
  ValueTransferClass,
  ValueTransferKindEnum,
  ValueTransferStatusEnum,
  ServerChainNameEnum,
  SendPageStateClass,
  ToAddrClass,
} from "../appstate";
import { ContextApp } from "../../context/ContextAppState";

jest.mock("../../electronBridge");

// `parseZcashURITargets` is overridable per-test via mockParseZcashURITargetsImpl. Using a
// closure instead of a jest.fn() so it survives Jest's `resetMocks: true`.
const defaultParse = async (input: string): Promise<any> => {
  if (input.startsWith("zcash:")) {
    return [
      { address: input.replace("zcash:", ""), amount: 5, memoString: "hi", message: undefined, label: undefined },
    ];
  }
  if (input.startsWith("error")) {
    return "Error: bad URI";
  }
  return input;
};
let mockParseZcashURITargetsImpl: (input: string) => Promise<any> = defaultParse;
jest.mock("../../utils/uris", () => ({
  parseZcashURITargets: (input: string) => mockParseZcashURITargetsImpl(input),
  ZcashURITarget: class {},
}));

// Capture the props each ToAddrBox receives so we can drive its callbacks directly.
jest.mock("./components/ToAddrBox", () => ({
  __esModule: true,
  default: jest.fn(() => null),
}));

// Don't bother rendering the real modal in these tests.
jest.mock("./components/SendConfirmModal", () => ({
  __esModule: true,
  default: jest.fn(() => null),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Send = require("./Send").default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { native } = require("../../electronBridge");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ToAddrBoxMock = require("./components/ToAddrBox").default as jest.Mock;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const SendConfirmModalMock = require("./components/SendConfirmModal").default as jest.Mock;

// The props the row at `index` last rendered with.
const rowProps = (index: number = 0): any => {
  const calls = ToAddrBoxMock.mock.calls.filter((c: any[]) => c[0].index === index);
  return calls.length ? calls[calls.length - 1][0] : undefined;
};
// How many rows the latest render drew. Every row is told the batch size.
const lastRowCount = (): number => {
  const calls = ToAddrBoxMock.mock.calls;
  return calls.length ? calls[calls.length - 1][0].total : 0;
};
const lastSendConfirmModalProps = (): any => {
  const calls = SendConfirmModalMock.mock.calls;
  return calls.length ? calls[calls.length - 1][0] : undefined;
};

const makeBalance = (overrides: Partial<TotalBalanceClass> = {}): TotalBalanceClass => {
  const b = new TotalBalanceClass();
  return Object.assign(b, overrides);
};

const makeValueTransfer = (confirmations: number): ValueTransferClass => {
  return new ValueTransferClass(
    ValueTransferKindEnum.sent,
    confirmations,
    100,
    ValueTransferStatusEnum.confirmed,
    "txid",
    0,
    1,
    "addr",
  );
};

const stateWith = (...rows: Partial<ToAddrClass>[]): SendPageStateClass => {
  const state = new SendPageStateClass();
  state.toaddrs = rows.map((row: Partial<ToAddrClass>) => Object.assign(new ToAddrClass(), row));
  return state;
};

// Holds the send state the way Routes does, so adding, removing and clearing
// rows render the screen again with the new state.
const StatefulSend = ({ initial }: { initial: SendPageStateClass }) => {
  const context = useContext(ContextApp);
  const [sendPageState, setSendPageState] = useState<SendPageStateClass>(initial);
  return (
    <ContextApp.Provider value={{ ...context, sendPageState }}>
      <Send sendTransaction={jest.fn()} setSendPageState={setSendPageState} addAddressBookEntry={jest.fn()} />
    </ContextApp.Provider>
  );
};

// What a row would report once it has checked its address and amount.
const reportRow = (index: number, status: { valid: boolean; addressKind?: AddressKindEnum }) => {
  act(() => {
    rowProps(index).onStatusChange(status);
  });
};

const wait = (ms: number) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));

beforeEach(() => {
  // resetMocks: true is enabled globally so mock implementations are wiped;
  // restore the ones the tests rely on.
  ToAddrBoxMock.mockImplementation(() => null);
  SendConfirmModalMock.mockImplementation(() => null);
  mockParseZcashURITargetsImpl = defaultParse;
});

describe("Send", () => {
  it("renders the read-only banner when readOnly is true", () => {
    render(<Send sendTransaction={jest.fn()} setSendPageState={jest.fn()} />, {
      contextOverrides: { readOnly: true },
    });
    expect(screen.getByText(/only-watch wallet/i)).toBeInTheDocument();
  });

  it("renders the full Send page when not read-only", () => {
    render(<Send sendTransaction={jest.fn()} setSendPageState={jest.fn()} />);
    expect(screen.getByRole("button", { name: /^Send$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Clear/i })).toBeInTheDocument();
    expect(rowProps()).toBeDefined();
  });

  it("shows the pending warning when there are unconfirmed value transfers", () => {
    render(<Send sendTransaction={jest.fn()} setSendPageState={jest.fn()} />, {
      contextOverrides: {
        valueTransfers: [makeValueTransfer(1)],
        totalBalance: makeBalance({ confirmedTransparentBalance: 1, totalSpendableBalance: 1 }),
      },
    });
    expect(screen.getByText(/Some transactions are pending/)).toBeInTheDocument();
  });

  it("shows the Shield Transparent button when conditions are met", async () => {
    const calculateShieldFee = jest.fn().mockResolvedValue(0.0001);
    render(<Send sendTransaction={jest.fn()} setSendPageState={jest.fn()} />, {
      contextOverrides: {
        totalBalance: makeBalance({ confirmedTransparentBalance: 1, totalSpendableBalance: 1 }),
        calculateShieldFee,
      },
    });
    await waitFor(() => expect(calculateShieldFee).toHaveBeenCalled());
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Shield Transparent Balance/ })).toBeInTheDocument();
    });
  });

  it("passes modalIsOpen=false to SendConfirmModal by default", () => {
    render(<Send sendTransaction={jest.fn()} setSendPageState={jest.fn()} />);
    expect(lastSendConfirmModalProps()?.modalIsOpen).toBe(false);
    // Clicking Clear should not crash even without a recipient.
    const clearBtn = screen.getByRole("button", { name: /Clear/i });
    fireEvent.click(clearBtn);
  });

  it("renders the fetchError banner when fetchError.error is set", () => {
    render(<Send sendTransaction={jest.fn()} setSendPageState={jest.fn()} />, {
      contextOverrides: {
        fetchError: { command: "send", error: "boom" } as any,
      },
    });
    expect(screen.getByText("send: boom")).toBeInTheDocument();
  });

  it("uses currentWallet.chain_name when calling ToAddrBox", () => {
    render(<Send sendTransaction={jest.fn()} setSendPageState={jest.fn()} />, {
      contextOverrides: {
        currentWallet: { wallet_name: "w", chain_name: ServerChainNameEnum.testChainName, id: "0" } as any,
      },
    });
    expect(rowProps().serverChainName).toBe(ServerChainNameEnum.testChainName);
  });

  it("falls back to mainnet chain name when no currentWallet", () => {
    render(<Send sendTransaction={jest.fn()} setSendPageState={jest.fn()} />);
    expect(rowProps().serverChainName).toBe(ServerChainNameEnum.mainChainName);
  });

  it("clearToAddrs replaces sendPageState with a fresh instance", () => {
    const setSendPageState = jest.fn();
    render(<Send sendTransaction={jest.fn()} setSendPageState={setSendPageState} />, {
      contextOverrides: {
        totalBalance: makeBalance({ totalSpendableBalance: 2 }),
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /Clear/i }));
    expect(setSendPageState).toHaveBeenCalledWith(expect.any(SendPageStateClass));
  });

  describe("updateToField", () => {
    it("strips spaces and propagates address when URI is a plain string", async () => {
      const setSendPageState = jest.fn();
      render(<Send sendTransaction={jest.fn()} setSendPageState={setSendPageState} />, {
        contextOverrides: {
          sendPageState: new SendPageStateClass(),
        },
      });
      await act(async () => {
        await rowProps().updateToField("u1addr with spaces", null, null);
      });
      expect(setSendPageState).toHaveBeenCalled();
      const newState = setSendPageState.mock.calls.at(-1)![0];
      expect(newState.toaddrs[0].to).toBe("u1addrwithspaces");
    });

    // A payment request typed or pasted into the field fills the row it landed in.
    it("fills the row from a payment URI", async () => {
      const setSendPageState = jest.fn();
      render(<Send sendTransaction={jest.fn()} setSendPageState={setSendPageState} />);
      await act(async () => {
        await rowProps().updateToField("zcash:u1foo", null, null);
      });
      const newState = setSendPageState.mock.calls.at(-1)![0];
      expect(newState.toaddrs).toHaveLength(1);
      expect(newState.toaddrs[0]).toEqual(expect.objectContaining({ to: "u1foo", amount: 5, memo: "hi" }));
    });

    // The rest of a multi-recipient request goes straight after the row it was
    // pasted into, ahead of the rows already written below it.
    it("adds the other recipients of a request right after the row", async () => {
      mockParseZcashURITargetsImpl = async () => [
        { address: "u1one", amount: 1 },
        { address: "u1two", amount: 2, memoString: "second" },
      ];
      const setSendPageState = jest.fn();
      render(<Send sendTransaction={jest.fn()} setSendPageState={setSendPageState} />, {
        contextOverrides: { sendPageState: stateWith({ to: "" }, { to: "u1below", amount: 3 }) },
      });
      await act(async () => {
        await rowProps(0).updateToField("zcash:?address=u1one", null, null);
      });
      const newState = setSendPageState.mock.calls.at(-1)![0];
      expect(newState.toaddrs.map((t: ToAddrClass) => t.to)).toEqual(["u1one", "u1two", "u1below"]);
      expect(newState.toaddrs[1].memo).toBe("second");
    });

    it("keeps the typed address when URI returns an error string", async () => {
      const setSendPageState = jest.fn();
      render(<Send sendTransaction={jest.fn()} setSendPageState={setSendPageState} />);
      mockParseZcashURITargetsImpl = async () => "Error: malformed";
      await act(async () => {
        await rowProps().updateToField("zcash:weird", null, null);
      });
      const lastState = setSendPageState.mock.calls.at(-1)![0];
      expect(lastState.toaddrs[0].to).toBe("zcash:weird");
    });

    it("rejects out-of-range amounts", async () => {
      const setSendPageState = jest.fn();
      const initial = new SendPageStateClass();
      initial.toaddrs[0].amount = 5;
      render(<Send sendTransaction={jest.fn()} setSendPageState={setSendPageState} />, {
        contextOverrides: { sendPageState: initial },
      });
      setSendPageState.mockClear();
      await act(async () => {
        await rowProps().updateToField(null, "-1", null);
      });
      expect(setSendPageState).not.toHaveBeenCalled();
    });

    it("accepts valid amounts and memos", async () => {
      const setSendPageState = jest.fn();
      render(<Send sendTransaction={jest.fn()} setSendPageState={setSendPageState} />);
      await act(async () => {
        await rowProps().updateToField(null, "1.5", null);
      });
      let lastState = setSendPageState.mock.calls.at(-1)![0];
      expect(lastState.toaddrs[0].amount).toBe(1.5);

      await act(async () => {
        await rowProps().updateToField(null, null, "hello memo");
      });
      lastState = setSendPageState.mock.calls.at(-1)![0];
      expect(lastState.toaddrs[0].memo).toBe("hello memo");
    });
  });

  describe("updateZnsAlias and setMaxAmount", () => {
    it("updateZnsAlias propagates alias through new state", () => {
      const setSendPageState = jest.fn();
      render(<Send sendTransaction={jest.fn()} setSendPageState={setSendPageState} />);
      act(() => {
        rowProps().updateZnsAlias("alice.zcash");
      });
      const lastState = setSendPageState.mock.calls.at(-1)![0];
      expect(lastState.toaddrs[0].znsAlias).toBe("alice.zcash");
    });

    it("setMaxAmount trims precision and clamps negative to zero", () => {
      const setSendPageState = jest.fn();
      render(<Send sendTransaction={jest.fn()} setSendPageState={setSendPageState} />);
      act(() => {
        rowProps().setMaxAmount(-1);
      });
      let lastState = setSendPageState.mock.calls.at(-1)![0];
      expect(lastState.toaddrs[0].amount).toBe(0);

      act(() => {
        rowProps().setMaxAmount(2.123456789);
      });
      lastState = setSendPageState.mock.calls.at(-1)![0];
      expect(lastState.toaddrs[0].amount).toBeLessThanOrEqual(2.12345679);
    });
  });

  describe("recipients", () => {
    it("shows a lone recipient with no remove action and nothing folded", () => {
      render(<Send sendTransaction={jest.fn()} setSendPageState={jest.fn()} />);
      const props = rowProps(0);
      expect(props.total).toBe(1);
      expect(props.collapsed).toBe(false);
      expect(props.onRemove).toBeUndefined();
    });

    // A row with no address would only add an empty recipient. Everything else
    // it can be missing shows in red on the row and does not stop the batch
    // from growing.
    // With its own empty state rather than the context's: that one instance is
    // shared by every test in the file, and the ones above write into it.
    it("waits for an address before another recipient can be added", () => {
      render(<Send sendTransaction={jest.fn()} setSendPageState={jest.fn()} />, {
        contextOverrides: { sendPageState: stateWith({}) },
      });
      expect(screen.getByRole("button", { name: /add recipient/i })).toBeDisabled();
    });

    it("offers another recipient once this one has an address, whatever else is missing", () => {
      render(<Send sendTransaction={jest.fn()} setSendPageState={jest.fn()} />, {
        contextOverrides: { sendPageState: stateWith({ to: "u1abc", amount: NaN }) },
      });
      expect(screen.getByRole("button", { name: /add recipient/i })).toBeEnabled();
    });

    // The new row is the one being edited; the one before it folds to a line.
    it("adds a recipient, which becomes the one being edited", async () => {
      render(<StatefulSend initial={stateWith({ to: "u1first", amount: 1 })} />);
      fireEvent.click(screen.getByRole("button", { name: /add recipient/i }));
      await waitFor(() => expect(lastRowCount()).toBe(2));
      expect(rowProps(1).collapsed).toBe(false);
      expect(rowProps(0).collapsed).toBe(true);
      expect(rowProps(0).onRemove).toBeDefined();
    });

    it("unfolds a folded recipient and folds the other", async () => {
      render(<StatefulSend initial={stateWith({ to: "u1a", amount: 1 }, { to: "u1b", amount: 1 })} />);
      expect(rowProps(0).collapsed).toBe(true);
      act(() => {
        rowProps(0).onExpand();
      });
      await waitFor(() => expect(rowProps(0).collapsed).toBe(false));
      expect(rowProps(1).collapsed).toBe(true);
    });

    // Removing a recipient loses what was written into it, so it asks, and the
    // row stays until the answer is yes.
    it("asks before removing a recipient, and the one left has no remove action", async () => {
      const openConfirmModal = jest.fn();
      render(<StatefulSend initial={stateWith({ to: "u1a", amount: 1 }, { to: "u1b", amount: 1 })} />, {
        contextOverrides: { openConfirmModal },
      });
      act(() => {
        rowProps(1).onRemove();
      });
      expect(openConfirmModal).toHaveBeenCalledWith(
        "Remove Recipient",
        expect.stringContaining("recipient 2"),
        expect.any(Function),
      );
      expect(lastRowCount()).toBe(2);
      act(() => {
        openConfirmModal.mock.calls[0][2]();
      });
      await waitFor(() => expect(lastRowCount()).toBe(1));
      expect(rowProps(0).toaddr.to).toBe("u1a");
      expect(rowProps(0).onRemove).toBeUndefined();
    });

    // An empty recipient has nothing to lose, so it goes without asking.
    it("removes an empty recipient without asking", async () => {
      const openConfirmModal = jest.fn();
      render(<StatefulSend initial={stateWith({ to: "u1a", amount: 1 }, {})} />, {
        contextOverrides: { openConfirmModal },
      });
      act(() => {
        rowProps(1).onRemove();
      });
      await waitFor(() => expect(lastRowCount()).toBe(1));
      expect(openConfirmModal).not.toHaveBeenCalled();
      expect(rowProps(0).toaddr.to).toBe("u1a");
    });

    // Nothing is dropped to honour the cap: the batch loads whole, and the
    // screen says how many to take out.
    it("keeps a batch over the cap whole and asks for the extra recipients to be removed", () => {
      const rows = Array.from({ length: 11 }, (_, i: number) => ({ to: `u1r${i}`, amount: 1 }));
      render(<Send sendTransaction={jest.fn()} setSendPageState={jest.fn()} />, {
        contextOverrides: { sendPageState: stateWith(...rows) },
      });
      expect(lastRowCount()).toBe(11);
      expect(screen.getByText(/up to 10 recipients\. Remove 1\./i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /add recipient/i })).toBeDisabled();
    });

    it("points out a recipient paying the same address as an earlier one", () => {
      render(<Send sendTransaction={jest.fn()} setSendPageState={jest.fn()} />, {
        contextOverrides: { sendPageState: stateWith({ to: "u1same" }, { to: "u1other" }, { to: "u1same" }) },
      });
      expect(rowProps(2).duplicateOfIndex).toBe(0);
      expect(rowProps(1).duplicateOfIndex).toBeUndefined();
      expect(rowProps(0).duplicateOfIndex).toBeUndefined();
    });

    // Clearing a batch loses every row, so it asks, and the rows stay until
    // the answer is yes.
    it("asks before clearing a batch", async () => {
      const openConfirmModal = jest.fn();
      render(<StatefulSend initial={stateWith({ to: "u1a", amount: 1 }, { to: "u1b", amount: 1 })} />, {
        contextOverrides: { openConfirmModal },
      });
      fireEvent.click(screen.getByRole("button", { name: /^clear$/i }));
      expect(openConfirmModal).toHaveBeenCalledWith(
        "Clear Recipients",
        expect.stringContaining("2 recipients"),
        expect.any(Function),
      );
      expect(lastRowCount()).toBe(2);
      act(() => {
        openConfirmModal.mock.calls[0][2]();
      });
      await waitFor(() => expect(lastRowCount()).toBe(1));
    });

    it("leaves room for the other recipients when filling a row with max", async () => {
      render(<Send sendTransaction={jest.fn()} setSendPageState={jest.fn()} />, {
        contextOverrides: {
          totalBalance: makeBalance({ totalSpendableBalance: 1 }),
          sendPageState: stateWith({ to: "u1a", amount: 0.3 }, { to: "u1b", amount: 0 }),
        },
      });
      // 1 ZEC spendable, less the other row's 0.3, less one output's marginal fee.
      await waitFor(() => expect(rowProps(1).maxAmount).toBeCloseTo(0.69995, 8));
    });

    it("totals the batch under the recipients", () => {
      render(<Send sendTransaction={jest.fn()} setSendPageState={jest.fn()} />, {
        contextOverrides: { sendPageState: stateWith({ to: "u1a", amount: 0.3 }, { to: "u1b", amount: 0.2 }) },
      });
      expect(screen.getByText(/2 recipients/)).toBeInTheDocument();
      expect(screen.getByText(/^Total/).textContent).toMatch(/0\.5/);
    });

    it("warns that transparent recipients in one transaction are linked to each other", () => {
      render(<Send sendTransaction={jest.fn()} setSendPageState={jest.fn()} />, {
        contextOverrides: { sendPageState: stateWith({ to: "t1a", amount: 1 }, { to: "t1b", amount: 1 }) },
      });
      reportRow(0, { valid: true, addressKind: AddressKindEnum.transparent });
      reportRow(1, { valid: true, addressKind: AddressKindEnum.transparent });
      expect(screen.getByText(/publicly linked/)).toBeInTheDocument();
    });

    it("does not warn about a single transparent recipient", () => {
      render(<Send sendTransaction={jest.fn()} setSendPageState={jest.fn()} />, {
        contextOverrides: { sendPageState: stateWith({ to: "t1a", amount: 1 }, { to: "u1b", amount: 1 }) },
      });
      reportRow(0, { valid: true, addressKind: AddressKindEnum.transparent });
      reportRow(1, { valid: true, addressKind: AddressKindEnum.unified });
      expect(screen.queryByText(/publicly linked/)).not.toBeInTheDocument();
    });
  });

  describe("fee", () => {
    const spendable = (zec: number) =>
      (native.get_spendable_balance_with_address as jest.Mock).mockResolvedValue(
        JSON.stringify({ spendable_balance: zec * 10 ** 8 }),
      );

    // A dash in its place read as a fee of nothing, rather than as a quote
    // still to come.
    it("states no fee until there is one", () => {
      render(<Send sendTransaction={jest.fn()} setSendPageState={jest.fn()} />, {
        contextOverrides: { sendPageState: stateWith({ to: "u1abc", amount: 0.5 }) },
      });
      expect(screen.queryByText(/^Fee /)).not.toBeInTheDocument();
    });

    it("quotes one fee for the whole batch", async () => {
      spendable(2);
      (native.send as jest.Mock).mockResolvedValue(JSON.stringify({ fee: 15_000 }));
      render(<Send sendTransaction={jest.fn()} setSendPageState={jest.fn()} />, {
        contextOverrides: { sendPageState: stateWith({ to: "u1a", amount: 0.5 }, { to: "u1b", amount: 0.25 }) },
      });
      reportRow(0, { valid: true, addressKind: AddressKindEnum.unified });
      reportRow(1, { valid: true, addressKind: AddressKindEnum.unified });
      await waitFor(() => expect(native.send).toHaveBeenCalled());
      const outputs = JSON.parse((native.send as jest.Mock).mock.calls.at(-1)[0]);
      expect(outputs.map((o: any) => o.address)).toEqual(["u1a", "u1b"]);
      expect(await screen.findByText(/Fee .*0\.00015/)).toBeInTheDocument();
    });

    // zip321 refuses a zero-valued output to a transparent recipient, and the
    // amount field starts at zero, so quoting on a valid address alone brought
    // the consensus error back on the keystroke that finished the address.
    it("asks for no fee for a transparent recipient still at zero", async () => {
      spendable(0);
      render(<Send sendTransaction={jest.fn()} setSendPageState={jest.fn()} />, {
        contextOverrides: { sendPageState: stateWith({ to: "t1abc", amount: 0 }) },
      });
      reportRow(0, { valid: true, addressKind: AddressKindEnum.transparent });
      await wait(450);
      expect(native.send).not.toHaveBeenCalled();
    });

    // A zero-valued shielded output is allowed: a memo with no money is a
    // message. Its fee is there as soon as the address is.
    it("quotes the fee for a shielded recipient at zero as soon as its address is valid", async () => {
      spendable(2);
      (native.send as jest.Mock).mockResolvedValue(JSON.stringify({ fee: 10_000 }));
      render(<Send sendTransaction={jest.fn()} setSendPageState={jest.fn()} />, {
        contextOverrides: { sendPageState: stateWith({ to: "u1abc", amount: 0 }) },
      });
      reportRow(0, { valid: true, addressKind: AddressKindEnum.unified });
      await waitFor(() => expect(native.send).toHaveBeenCalled());
      expect(JSON.parse((native.send as jest.Mock).mock.calls.at(-1)[0])[0].amount).toBe(0);
    });

    // A quote is harmless, a send is not: no amount and no memo would pay a fee
    // to deliver nothing, so Send waits for one or the other.
    it("offers to send nothing only when a memo goes with it", async () => {
      spendable(2);
      (native.send as jest.Mock).mockResolvedValue(JSON.stringify({ fee: 10_000 }));
      const mixnetView = {
        ...jest.requireActual("../../rpc/components/mixnetPresenter").UNKNOWN_MIXNET_VIEW,
        sendBlocked: false,
      };

      const { unmount } = render(<Send sendTransaction={jest.fn()} setSendPageState={jest.fn()} />, {
        contextOverrides: { mixnetView, sendPageState: stateWith({ to: "u1abc", amount: 0 }) },
      });
      reportRow(0, { valid: true, addressKind: AddressKindEnum.unified });
      await waitFor(() => expect(native.send).toHaveBeenCalled());
      await wait(50);
      expect(screen.getByRole("button", { name: /^Send$/ })).toBeDisabled();
      unmount();

      render(<Send sendTransaction={jest.fn()} setSendPageState={jest.fn()} />, {
        contextOverrides: { mixnetView, sendPageState: stateWith({ to: "u1abc", amount: 0, memo: "hello" }) },
      });
      reportRow(0, { valid: true, addressKind: AddressKindEnum.unified });
      await waitFor(() => expect(screen.getByRole("button", { name: /^Send$/ })).toBeEnabled());
    });

    it("asks for no fee while any recipient is not ready", async () => {
      spendable(2);
      render(<Send sendTransaction={jest.fn()} setSendPageState={jest.fn()} />, {
        contextOverrides: { sendPageState: stateWith({ to: "u1a", amount: 0.5 }, { to: "bad", amount: 0.5 }) },
      });
      reportRow(0, { valid: true, addressKind: AddressKindEnum.unified });
      reportRow(1, { valid: false });
      await wait(450);
      expect(native.send).not.toHaveBeenCalled();
    });

    it("does not quote a batch that exceeds the spendable funds", async () => {
      spendable(0.5);
      render(<Send sendTransaction={jest.fn()} setSendPageState={jest.fn()} />, {
        contextOverrides: { sendPageState: stateWith({ to: "u1a", amount: 0.4 }, { to: "u1b", amount: 0.4 }) },
      });
      reportRow(0, { valid: true, addressKind: AddressKindEnum.unified });
      reportRow(1, { valid: true, addressKind: AddressKindEnum.unified });
      expect(await screen.findByText("Total exceeds spendable funds")).toBeInTheDocument();
      expect(native.send).not.toHaveBeenCalled();
    });

    it("captures errors returned by native.get_spendable_balance_with_address", async () => {
      (native.get_spendable_balance_with_address as jest.Mock).mockResolvedValue("Error: bad addr");
      render(<Send sendTransaction={jest.fn()} setSendPageState={jest.fn()} />, {
        contextOverrides: { sendPageState: stateWith({ to: "u1bad", amount: 0.5 }) },
      });
      reportRow(0, { valid: true, addressKind: AddressKindEnum.unified });
      await wait(450);
      expect(native.send).not.toHaveBeenCalled();
    });

    it("handles thrown exceptions while reading the spendable funds", async () => {
      (native.get_spendable_balance_with_address as jest.Mock).mockRejectedValue(new Error("boom"));
      render(<Send sendTransaction={jest.fn()} setSendPageState={jest.fn()} />, {
        contextOverrides: { sendPageState: stateWith({ to: "u1abc", amount: 0.5 }) },
      });
      reportRow(0, { valid: true, addressKind: AddressKindEnum.unified });
      await wait(450);
      expect(native.send).not.toHaveBeenCalled();
    });

    it("shows the proposal's own error under the recipients", async () => {
      spendable(2);
      (native.send as jest.Mock).mockResolvedValue(JSON.stringify({ error: "insufficient" }));
      render(<Send sendTransaction={jest.fn()} setSendPageState={jest.fn()} />, {
        contextOverrides: { sendPageState: stateWith({ to: "u1abc", amount: 0.5 }) },
      });
      reportRow(0, { valid: true, addressKind: AddressKindEnum.unified });
      expect(await screen.findByText("insufficient")).toBeInTheDocument();
    });
  });
});
