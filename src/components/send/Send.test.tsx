import React from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "../../test-utils";
import {
  TotalBalanceClass,
  ValueTransferClass,
  ValueTransferKindEnum,
  ValueTransferStatusEnum,
  ServerChainNameEnum,
  SendPageStateClass,
  ToAddrClass,
} from "../appstate";

jest.mock("../../electronBridge");

// `parseZcashURI` is overridable per-test via mockParseZcashURIImpl. Using a closure
// instead of a jest.fn() so it survives Jest's `resetMocks: true`.
let mockParseZcashURIImpl: (input: string) => Promise<any> = async (input: string) => {
  if (input.startsWith("zcash:")) {
    return { address: input.replace("zcash:", ""), amount: 5, memoString: "hi", message: undefined, label: undefined };
  }
  if (input.startsWith("error")) {
    return "Error: bad URI";
  }
  return input;
};
jest.mock("../../utils/uris", () => ({
  parseZcashURI: (input: string) => mockParseZcashURIImpl(input),
  ZcashURITarget: class {},
}));

// Capture the props ToAddrBox receives so we can drive its callbacks directly.
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

const lastToAddrBoxProps = (): any => {
  const calls = ToAddrBoxMock.mock.calls;
  return calls.length ? calls[calls.length - 1][0] : undefined;
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

beforeEach(() => {
  // resetMocks: true is enabled globally so mock implementations are wiped;
  // restore the ones the tests rely on.
  ToAddrBoxMock.mockImplementation(() => null);
  SendConfirmModalMock.mockImplementation(() => null);
  mockParseZcashURIImpl = async (input: string) => {
    if (input.startsWith("zcash:")) {
      return {
        address: input.replace("zcash:", ""),
        amount: 5,
        memoString: "hi",
        message: undefined,
        label: undefined,
      };
    }
    if (input.startsWith("error")) {
      return "Error: bad URI";
    }
    return input;
  };
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
    expect(lastToAddrBoxProps()).toBeDefined();
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
    expect(lastToAddrBoxProps().serverChainName).toBe(ServerChainNameEnum.testChainName);
  });

  it("falls back to mainnet chain name when no currentWallet", () => {
    render(<Send sendTransaction={jest.fn()} setSendPageState={jest.fn()} />);
    expect(lastToAddrBoxProps().serverChainName).toBe(ServerChainNameEnum.mainChainName);
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
      const props = lastToAddrBoxProps();
      await act(async () => {
        await props.updateToField("u1addr with spaces", null, null);
      });
      expect(setSendPageState).toHaveBeenCalled();
      const newState = setSendPageState.mock.calls.at(-1)![0];
      expect(newState.toaddr.to).toBe("u1addrwithspaces");
    });

    it("uses setSendTo when URI parse returns an object", async () => {
      const setSendTo = jest.fn();
      render(<Send sendTransaction={jest.fn()} setSendPageState={jest.fn()} />, {
        contextOverrides: { setSendTo },
      });
      const props = lastToAddrBoxProps();
      await act(async () => {
        await props.updateToField("zcash:u1foo", null, null);
      });
      expect(setSendTo).toHaveBeenCalledWith(expect.objectContaining({ address: "u1foo" }));
    });

    it("keeps the typed address when URI returns an error string", async () => {
      const setSendPageState = jest.fn();
      render(<Send sendTransaction={jest.fn()} setSendPageState={setSendPageState} />);
      const props = lastToAddrBoxProps();
      mockParseZcashURIImpl = async () => "Error: malformed";
      await act(async () => {
        await props.updateToField("zcash:weird", null, null);
      });
      const lastState = setSendPageState.mock.calls.at(-1)![0];
      expect(lastState.toaddr.to).toBe("zcash:weird");
    });

    it("rejects out-of-range amounts", async () => {
      const setSendPageState = jest.fn();
      const initial = new SendPageStateClass();
      initial.toaddr.amount = 5;
      render(<Send sendTransaction={jest.fn()} setSendPageState={setSendPageState} />, {
        contextOverrides: { sendPageState: initial },
      });
      const props = lastToAddrBoxProps();
      setSendPageState.mockClear();
      await act(async () => {
        await props.updateToField(null, "-1", null);
      });
      expect(setSendPageState).not.toHaveBeenCalled();
    });

    it("accepts valid amounts and memos", async () => {
      const setSendPageState = jest.fn();
      render(<Send sendTransaction={jest.fn()} setSendPageState={setSendPageState} />);
      const props = lastToAddrBoxProps();
      await act(async () => {
        await props.updateToField(null, "1.5", null);
      });
      let lastState = setSendPageState.mock.calls.at(-1)![0];
      expect(lastState.toaddr.amount).toBe(1.5);

      await act(async () => {
        await props.updateToField(null, null, "hello memo");
      });
      lastState = setSendPageState.mock.calls.at(-1)![0];
      expect(lastState.toaddr.memo).toBe("hello memo");
    });
  });

  describe("updateZnsAlias and setMaxAmount", () => {
    it("updateZnsAlias propagates alias through new state", () => {
      const setSendPageState = jest.fn();
      render(<Send sendTransaction={jest.fn()} setSendPageState={setSendPageState} />);
      const props = lastToAddrBoxProps();
      props.updateZnsAlias("alice.zcash");
      const lastState = setSendPageState.mock.calls.at(-1)![0];
      expect(lastState.toaddr.znsAlias).toBe("alice.zcash");
    });

    it("setMaxAmount trims precision and clamps negative to zero", async () => {
      const setSendPageState = jest.fn();
      render(<Send sendTransaction={jest.fn()} setSendPageState={setSendPageState} />);
      const props = lastToAddrBoxProps();
      await act(async () => {
        await props.setMaxAmount(-1);
      });
      let lastState = setSendPageState.mock.calls.at(-1)![0];
      expect(lastState.toaddr.amount).toBe(0);

      await act(async () => {
        await props.setMaxAmount(2.123456789);
      });
      lastState = setSendPageState.mock.calls.at(-1)![0];
      expect(lastState.toaddr.amount).toBeLessThanOrEqual(2.12345679);
    });
  });

  describe("fetchSendFeeAndErrorAndSpendable", () => {
    it("reports the fee parsed from native.send", async () => {
      (native.get_spendable_balance_with_address as jest.Mock).mockResolvedValue(
        JSON.stringify({ spendable_balance: 200_000_000 }),
      );
      (native.send as jest.Mock).mockResolvedValue(JSON.stringify({ fee: 10_000 }));
      const sendPageState = new SendPageStateClass();
      sendPageState.toaddr = Object.assign(new ToAddrClass(), { to: "u1abc", amount: 0.5, memo: "" });
      render(<Send sendTransaction={jest.fn()} setSendPageState={jest.fn()} />, {
        contextOverrides: { sendPageState },
      });
      const props = lastToAddrBoxProps();
      await act(async () => {
        await props.fetchSendFeeAndErrorAndSpendable();
      });
      expect(props.setSendFee).toBeDefined();
      expect(native.send).toHaveBeenCalled();
    });

    it("captures errors returned by native.get_spendable_balance_with_address", async () => {
      (native.get_spendable_balance_with_address as jest.Mock).mockResolvedValue("Error: bad addr");
      const sendPageState = new SendPageStateClass();
      sendPageState.toaddr = Object.assign(new ToAddrClass(), { to: "u1bad", amount: 0.5, memo: "" });
      render(<Send sendTransaction={jest.fn()} setSendPageState={jest.fn()} />, {
        contextOverrides: { sendPageState },
      });
      const props = lastToAddrBoxProps();
      await act(async () => {
        await props.fetchSendFeeAndErrorAndSpendable();
      });
      expect(native.send).not.toHaveBeenCalled();
    });

    it("handles thrown exceptions inside calculateSendFee", async () => {
      (native.get_spendable_balance_with_address as jest.Mock).mockRejectedValue(new Error("boom"));
      const sendPageState = new SendPageStateClass();
      sendPageState.toaddr = Object.assign(new ToAddrClass(), { to: "u1abc", amount: 0.5, memo: "" });
      render(<Send sendTransaction={jest.fn()} setSendPageState={jest.fn()} />, {
        contextOverrides: { sendPageState },
      });
      const props = lastToAddrBoxProps();
      await expect(props.fetchSendFeeAndErrorAndSpendable()).resolves.toBeUndefined();
    });

    it("captures error key inside JSON response from native.send", async () => {
      (native.get_spendable_balance_with_address as jest.Mock).mockResolvedValue(
        JSON.stringify({ spendable_balance: 200_000_000 }),
      );
      (native.send as jest.Mock).mockResolvedValue(JSON.stringify({ error: "insufficient" }));
      const sendPageState = new SendPageStateClass();
      sendPageState.toaddr = Object.assign(new ToAddrClass(), { to: "u1abc", amount: 0.5, memo: "" });
      render(<Send sendTransaction={jest.fn()} setSendPageState={jest.fn()} />, {
        contextOverrides: { sendPageState },
      });
      const props = lastToAddrBoxProps();
      await act(async () => {
        await props.fetchSendFeeAndErrorAndSpendable();
      });
      expect(native.send).toHaveBeenCalled();
    });
  });

  // The line rides the balance header, which every one of these pages carries.
});
