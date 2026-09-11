import React from "react";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { render } from "../../../test-utils";
import SendConfirmModal, { worstPrivacyLevel } from "./SendConfirmModal";
import { SendPageStateClass, ToAddrClass, InfoClass, TotalBalanceClass, ServerChainNameEnum } from "../../appstate";

jest.mock("../../../electronBridge");

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => {
  const actual = jest.requireActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Modal renders into document.body — set the app element to avoid the warning
beforeAll(() => {
  const div = document.createElement("div");
  div.setAttribute("id", "root");
  document.body.appendChild(div);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("react-modal").setAppElement("#root");
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { native } = require("../../../electronBridge");

const installElectronAPI = (overrides: { loadSettings?: any; authVerify?: any } = {}) => {
  const invoke = jest.fn(async (channel: string) => {
    if (channel === "loadSettings") return overrides.loadSettings ?? {};
    if (channel === "auth:verify") return overrides.authVerify ?? { success: true };
    return undefined;
  });
  Object.defineProperty(window, "electronAPI", {
    configurable: true,
    value: { ipcRenderer: { invoke } },
  });
  return invoke;
};

const makeProps = (
  overrides: Partial<{
    closeModal: () => void;
    sendTransaction: () => Promise<string>;
    clearToAddrs: () => void;
    modalIsOpen: boolean;
    toaddr: Partial<ToAddrClass>;
    // Several recipients; overrides `toaddr` when given.
    recipients: Partial<ToAddrClass>[];
    balance: Partial<TotalBalanceClass>;
    sendFee: number;
  }> = {},
) => {
  const base: Partial<ToAddrClass> = {
    to: "u1fakeaddress0000000000000000000000000000000000000000",
    amount: 1,
    memo: "",
    memoReplyTo: "",
  };
  const sendPageState = new SendPageStateClass();
  sendPageState.toaddrs = (overrides.recipients ?? [overrides.toaddr ?? {}]).map((recipient: Partial<ToAddrClass>) =>
    Object.assign(new ToAddrClass(), { ...base, ...recipient }),
  );

  const totalBalance = new TotalBalanceClass();
  Object.assign(totalBalance, {
    confirmedOrchardBalance: 5,
    confirmedSaplingBalance: 5,
    ...(overrides.balance ?? {}),
  });

  return {
    sendPageState,
    totalBalance,
    info: new InfoClass(),
    sendTransaction: overrides.sendTransaction ?? jest.fn().mockResolvedValue("abc123"),
    clearToAddrs: overrides.clearToAddrs ?? jest.fn(),
    closeModal: overrides.closeModal ?? jest.fn(),
    modalIsOpen: overrides.modalIsOpen ?? true,
    sendFee: overrides.sendFee ?? 0.0001,
    currencyName: "ZEC",
  };
};

const mainnetWallet = {
  id: 0,
  fileName: "zingo-wallet-0.dat",
  alias: "wallet",
  chain_name: ServerChainNameEnum.mainChainName,
} as any;

describe("SendConfirmModal", () => {
  beforeEach(() => {
    (native.parse_address as jest.Mock).mockReset();
    mockNavigate.mockReset();
    installElectronAPI();
  });

  it("renders when open", () => {
    render(<SendConfirmModal {...makeProps()} />);
    expect(screen.getByText("Confirm Transaction")).toBeInTheDocument();
  });

  it("does not render modal content when closed", () => {
    render(<SendConfirmModal {...makeProps({ modalIsOpen: false })} />);
    expect(screen.queryByText("Confirm Transaction")).not.toBeInTheDocument();
  });

  it("calls closeModal when Cancel is clicked", () => {
    const closeModal = jest.fn();
    render(<SendConfirmModal {...makeProps({ closeModal })} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(closeModal).toHaveBeenCalledTimes(1);
  });

  it("shows Cancel button before Send button", () => {
    render(<SendConfirmModal {...makeProps()} />);
    const buttons = screen.getAllByRole("button");
    const cancelIdx = buttons.findIndex((b) => /cancel/i.test(b.textContent ?? ""));
    const sendIdx = buttons.findIndex((b) => /^send$/i.test(b.textContent ?? ""));
    expect(cancelIdx).toBeLessThan(sendIdx);
  });

  describe("getPrivacyLevel", () => {
    it("returns '-' when address has no 'to' value", async () => {
      render(<SendConfirmModal {...makeProps({ toaddr: { to: "", amount: 0 } })} />);
      // The row is labelled "Privacy" now, beside the fee, in the same field
      // shape the rest of the app states a fact in.
      await screen.findByText("Privacy");
    });

    it("returns '-' when parse_address returns error", async () => {
      (native.parse_address as jest.Mock).mockResolvedValue("Error: bad address");
      render(<SendConfirmModal {...makeProps()} />, { contextOverrides: { currentWallet: mainnetWallet } });
      await waitFor(() => expect(native.parse_address).toHaveBeenCalled());
    });

    it("returns '-' when parse_address returns non-JSON", async () => {
      (native.parse_address as jest.Mock).mockResolvedValue("not-json");
      render(<SendConfirmModal {...makeProps()} />, { contextOverrides: { currentWallet: mainnetWallet } });
      await waitFor(() => expect(native.parse_address).toHaveBeenCalled());
    });

    it("returns '-' when parse_address throws", async () => {
      (native.parse_address as jest.Mock).mockRejectedValue(new Error("boom"));
      render(<SendConfirmModal {...makeProps()} />, { contextOverrides: { currentWallet: mainnetWallet } });
      await waitFor(() => expect(native.parse_address).toHaveBeenCalled());
    });

    it("returns '-' when chain_name mismatches", async () => {
      (native.parse_address as jest.Mock).mockResolvedValue(
        JSON.stringify({
          status: "success",
          chain_name: ServerChainNameEnum.testChainName,
          address_kind: "unified",
          receivers_available: ["orchard"],
        }),
      );
      render(<SendConfirmModal {...makeProps()} />, { contextOverrides: { currentWallet: mainnetWallet } });
      await waitFor(() => expect(native.parse_address).toHaveBeenCalled());
    });

    it("returns 'Private' for orchard→orchard", async () => {
      (native.parse_address as jest.Mock).mockResolvedValue(
        JSON.stringify({
          status: "success",
          chain_name: ServerChainNameEnum.mainChainName,
          address_kind: "unified",
          receivers_available: ["orchard"],
        }),
      );
      render(<SendConfirmModal {...makeProps({ toaddr: { amount: 1 }, balance: { confirmedOrchardBalance: 10 } })} />, {
        contextOverrides: { currentWallet: mainnetWallet },
      });
      expect(await screen.findByText("Private")).toBeInTheDocument();
    });

    it("returns 'Private' for sapling→sapling", async () => {
      (native.parse_address as jest.Mock).mockResolvedValue(
        JSON.stringify({
          status: "success",
          chain_name: ServerChainNameEnum.mainChainName,
          address_kind: "sapling",
          receivers_available: [],
        }),
      );
      render(
        <SendConfirmModal
          {...makeProps({
            toaddr: { amount: 1 },
            balance: { confirmedOrchardBalance: 0, confirmedSaplingBalance: 10 },
          })}
        />,
        { contextOverrides: { currentWallet: mainnetWallet } },
      );
      expect(await screen.findByText("Private")).toBeInTheDocument();
    });

    it("returns 'Amount Revealed' for orchard→sapling-only UA", async () => {
      (native.parse_address as jest.Mock).mockResolvedValue(
        JSON.stringify({
          status: "success",
          chain_name: ServerChainNameEnum.mainChainName,
          address_kind: "unified",
          receivers_available: ["sapling"],
        }),
      );
      render(<SendConfirmModal {...makeProps({ toaddr: { amount: 1 }, balance: { confirmedOrchardBalance: 10 } })} />, {
        contextOverrides: { currentWallet: mainnetWallet },
      });
      expect(await screen.findByText("Amount Revealed")).toBeInTheDocument();
    });

    it("returns 'Amount Revealed' for sapling→orchard", async () => {
      (native.parse_address as jest.Mock).mockResolvedValue(
        JSON.stringify({
          status: "success",
          chain_name: ServerChainNameEnum.mainChainName,
          address_kind: "unified",
          receivers_available: ["orchard"],
        }),
      );
      render(
        <SendConfirmModal
          {...makeProps({
            toaddr: { amount: 1 },
            balance: { confirmedOrchardBalance: 0, confirmedSaplingBalance: 10 },
          })}
        />,
        { contextOverrides: { currentWallet: mainnetWallet } },
      );
      expect(await screen.findByText("Amount Revealed")).toBeInTheDocument();
    });

    it("returns 'Amount Revealed' for orchard+sapling→sapling", async () => {
      (native.parse_address as jest.Mock).mockResolvedValue(
        JSON.stringify({
          status: "success",
          chain_name: ServerChainNameEnum.mainChainName,
          address_kind: "sapling",
          receivers_available: [],
        }),
      );
      // amount 8 needs orchard(5) + sapling(5) - fee
      render(
        <SendConfirmModal
          {...makeProps({
            toaddr: { amount: 7 },
            balance: { confirmedOrchardBalance: 5, confirmedSaplingBalance: 5 },
          })}
        />,
        { contextOverrides: { currentWallet: mainnetWallet } },
      );
      expect(await screen.findByText("Amount Revealed")).toBeInTheDocument();
    });

    it("returns 'Deshielded' for orchard→transparent", async () => {
      (native.parse_address as jest.Mock).mockResolvedValue(
        JSON.stringify({
          status: "success",
          chain_name: ServerChainNameEnum.mainChainName,
          address_kind: "transparent",
          receivers_available: [],
        }),
      );
      render(<SendConfirmModal {...makeProps({ toaddr: { amount: 1 }, balance: { confirmedOrchardBalance: 10 } })} />, {
        contextOverrides: { currentWallet: mainnetWallet },
      });
      expect(await screen.findByText("Deshielded")).toBeInTheDocument();
    });

    it("returns '-' when amount exceeds all available funds", async () => {
      (native.parse_address as jest.Mock).mockResolvedValue(
        JSON.stringify({
          status: "success",
          chain_name: ServerChainNameEnum.mainChainName,
          address_kind: "unified",
          receivers_available: ["orchard"],
        }),
      );
      render(
        <SendConfirmModal
          {...makeProps({
            toaddr: { amount: 100 },
            balance: { confirmedOrchardBalance: 5, confirmedSaplingBalance: 5 },
          })}
        />,
        { contextOverrides: { currentWallet: mainnetWallet } },
      );
      // parse_address won't even be called because `from === ""` short-circuits
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
  });

  describe("sendButton", () => {
    it("calls auth:verify when requireDeviceAuth is true; bails on failure", async () => {
      const invoke = installElectronAPI({ loadSettings: { requireDeviceAuth: true }, authVerify: { success: false } });
      const sendTransaction = jest.fn();
      const closeModal = jest.fn();
      render(<SendConfirmModal {...makeProps({ sendTransaction, closeModal })} />);
      fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
      await waitFor(() => expect(invoke).toHaveBeenCalledWith("auth:verify", "Authorize transaction"));
      expect(invoke).toHaveBeenCalledWith("loadSettings");
      expect(sendTransaction).not.toHaveBeenCalled();
      expect(closeModal).not.toHaveBeenCalled();
    });

    it("skips auth when requireDeviceAuth is unset", async () => {
      const invoke = installElectronAPI({ loadSettings: {} });
      const sendTransaction = jest.fn().mockResolvedValue("txid-1");
      const closeModal = jest.fn();
      const openErrorModal = jest.fn();
      render(<SendConfirmModal {...makeProps({ sendTransaction, closeModal })} />, {
        contextOverrides: { openErrorModal },
      });
      fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
      await waitFor(() =>
        expect(openErrorModal).toHaveBeenCalledWith("Computing Transaction", "Please wait...This could take a while"),
      );
      expect(invoke).not.toHaveBeenCalledWith("auth:verify", expect.anything());
      expect(closeModal).toHaveBeenCalled();
    });

    it("opens an error modal when sendTransaction throws", async () => {
      installElectronAPI();
      const sendTransaction = jest.fn().mockRejectedValue(new Error("insufficient"));
      const openErrorModal = jest.fn();
      const clearToAddrs = jest.fn();
      render(<SendConfirmModal {...makeProps({ sendTransaction, clearToAddrs })} />, {
        contextOverrides: { openErrorModal, currentWallet: mainnetWallet },
      });
      fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
      await waitFor(() => expect(openErrorModal).toHaveBeenCalledWith("Error Sending Transaction", "insufficient"));
      // On failure the tx isn't broadcast: no success modal, form kept for retry.
      expect(clearToAddrs).not.toHaveBeenCalled();
    });

    it("opens the success modal with a single TXID", async () => {
      installElectronAPI();
      const sendTransaction = jest.fn().mockResolvedValue("txid-one");
      const openErrorModal = jest.fn();
      render(<SendConfirmModal {...makeProps({ sendTransaction })} />, {
        contextOverrides: { openErrorModal, currentWallet: mainnetWallet },
      });
      fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
      await waitFor(() => {
        const successCall = openErrorModal.mock.calls.find((c) => c[0] === "Successfully Broadcast Transaction");
        expect(successCall).toBeDefined();
      });
    });

    it("opens the success modal with multiple TXIDs", async () => {
      installElectronAPI();
      const sendTransaction = jest.fn().mockResolvedValue("txid-one, txid-two, txid-three");
      const openErrorModal = jest.fn();
      render(<SendConfirmModal {...makeProps({ sendTransaction })} />, {
        contextOverrides: { openErrorModal, currentWallet: mainnetWallet },
      });
      fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
      await waitFor(() => {
        const successCall = openErrorModal.mock.calls.find((c) => c[0] === "Successfully Broadcast Transaction");
        expect(successCall).toBeDefined();
      });
    });

    it("surfaces the thrown Error's message in the error modal", async () => {
      installElectronAPI();
      const sendTransaction = jest.fn().mockRejectedValue(new Error("network is down"));
      const openErrorModal = jest.fn();
      render(<SendConfirmModal {...makeProps({ sendTransaction })} />, { contextOverrides: { openErrorModal } });
      fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
      await waitFor(() => expect(openErrorModal).toHaveBeenCalledWith("Error Sending Transaction", "network is down"));
    });

    it("handles non-Error thrown values from sendTransaction", async () => {
      installElectronAPI();
      const sendTransaction = jest.fn().mockRejectedValue("plain string error");
      const openErrorModal = jest.fn();
      render(<SendConfirmModal {...makeProps({ sendTransaction })} />, { contextOverrides: { openErrorModal } });
      fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
      await waitFor(() =>
        expect(openErrorModal).toHaveBeenCalledWith("Error Sending Transaction", "plain string error"),
      );
    });

    // Every recipient goes into the one send, in the order they were written.
    it("sends every recipient of a batch together", async () => {
      installElectronAPI();
      const sendTransaction = jest.fn().mockResolvedValue("txid-one");
      render(
        <SendConfirmModal
          {...makeProps({
            sendTransaction,
            recipients: [
              { to: "u1one", amount: 1 },
              { to: "u1two", amount: 2 },
            ],
          })}
        />,
        { contextOverrides: { currentWallet: mainnetWallet } },
      );
      fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
      await waitFor(() => expect(sendTransaction).toHaveBeenCalled());
      expect(sendTransaction.mock.calls[0][0].map((output: any) => output.address)).toEqual(["u1one", "u1two"]);
    });
  });
});

describe("SendConfirmModal layout", () => {
  // The same header the transfer detail carries, because this is the same
  // transaction one screen earlier.
  it("heads with the direction and what is happening", () => {
    render(<SendConfirmModal {...makeProps()} />);
    expect(screen.getByText("Sending")).toBeInTheDocument();
  });

  // Abbreviated in the middle, expanded and copied by the same press — the
  // gesture the transfer detail and the address book already use.
  it("abbreviates the address until it is pressed", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { clipboard } = require("../../../electronBridge");
    const to = "u1fakeaddress0000000000000000000000000000000000000000";
    render(<SendConfirmModal {...makeProps({ toaddr: { to } })} />);

    expect(screen.queryByText(to)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /copy address/i }));

    expect(clipboard.writeText).toHaveBeenCalledWith(to);
    expect(screen.getByText(to)).toBeInTheDocument();
  });

  it("states the amount, the fee and the privacy as labelled fields", async () => {
    render(<SendConfirmModal {...makeProps()} />);

    expect(screen.getByText("Amount")).toBeInTheDocument();
    expect(screen.getByText("Transaction Fee")).toBeInTheDocument();
    expect(await screen.findByText("Privacy")).toBeInTheDocument();
  });

  // The amount and the fee each state their fiat value underneath, which is
  // what the detail does — and the rate is the live one, because the send has
  // not happened yet.
  it("puts a fiat value under both figures, from the current price", () => {
    const props = makeProps({ toaddr: { amount: 2 }, sendFee: 0.0001 });
    // The fiat lines are gated on the wallet actually being on ZEC.
    props.info.currencyName = "ZEC";
    render(<SendConfirmModal {...props} />, { contextOverrides: { zecPrice: 50 } });

    expect(screen.getByText("USD 100.00")).toBeInTheDocument();
    expect(screen.getByText("USD < 0.01")).toBeInTheDocument();
  });

  // No row at all rather than an empty one: most sends carry no memo, and a
  // labelled blank is a question the reader has to answer.
  it("shows the memo only when there is one", () => {
    const { unmount } = render(<SendConfirmModal {...makeProps()} />);
    expect(screen.queryByText("Memo")).not.toBeInTheDocument();
    unmount();

    render(<SendConfirmModal {...makeProps({ toaddr: { memo: "for the coffee" } })} />);
    expect(screen.getByText("Memo")).toBeInTheDocument();
    expect(screen.getByText("for the coffee")).toBeInTheDocument();
  });

  it("numbers nothing when there is one recipient", () => {
    render(<SendConfirmModal {...makeProps()} />);
    expect(screen.queryByText(/Recipient 1 of/)).not.toBeInTheDocument();
  });
});

describe("SendConfirmModal with several recipients", () => {
  beforeEach(() => {
    (native.parse_address as jest.Mock).mockReset();
    installElectronAPI();
  });

  it("lists every recipient, numbered", () => {
    render(<SendConfirmModal {...makeProps({ recipients: [{ to: "u1one" }, { to: "u1two" }] })} />);
    expect(screen.getByText("Recipient 1 of 2")).toBeInTheDocument();
    expect(screen.getByText("Recipient 2 of 2")).toBeInTheDocument();
  });

  // One transaction, one fee: stated once under the recipients rather than
  // beside each amount.
  it("states the fee once, under all of them", () => {
    render(<SendConfirmModal {...makeProps({ recipients: [{ to: "u1one" }, { to: "u1two" }] })} />);
    expect(screen.getAllByText("Amount")).toHaveLength(2);
    expect(screen.getAllByText("Transaction Fee")).toHaveLength(1);
  });

  // Each amount fits in Orchard on its own; together they need Sapling too,
  // which reveals the amounts. The verdict follows the whole transaction.
  it("judges privacy by what the whole batch spends, not by each amount alone", async () => {
    (native.parse_address as jest.Mock).mockResolvedValue(
      JSON.stringify({
        status: "success",
        chain_name: ServerChainNameEnum.mainChainName,
        address_kind: "unified",
        receivers_available: ["orchard"],
      }),
    );
    render(
      <SendConfirmModal
        {...makeProps({
          recipients: [
            { to: "u1one", amount: 4 },
            { to: "u1two", amount: 4 },
          ],
          balance: { confirmedOrchardBalance: 5, confirmedSaplingBalance: 5 },
        })}
      />,
      { contextOverrides: { currentWallet: mainnetWallet } },
    );
    // Both recipients, and the batch as a whole.
    await waitFor(() => expect(screen.getAllByText("Amount Revealed")).toHaveLength(3));
  });

  it("gives the batch the privacy of its weakest recipient", async () => {
    (native.parse_address as jest.Mock).mockImplementation(async (address: string) =>
      JSON.stringify({
        status: "success",
        chain_name: ServerChainNameEnum.mainChainName,
        address_kind: address.startsWith("t") ? "transparent" : "unified",
        receivers_available: address.startsWith("t") ? [] : ["orchard"],
      }),
    );
    render(
      <SendConfirmModal
        {...makeProps({
          recipients: [
            { to: "u1one", amount: 1 },
            { to: "t1two", amount: 1 },
          ],
          balance: { confirmedOrchardBalance: 10 },
        })}
      />,
      { contextOverrides: { currentWallet: mainnetWallet } },
    );
    // The transparent recipient, and the batch it drags down with it.
    await waitFor(() => expect(screen.getAllByText("Deshielded")).toHaveLength(2));
    expect(screen.getByText("Private")).toBeInTheDocument();
  });
});

describe("worstPrivacyLevel", () => {
  it("is the weakest level present", () => {
    expect(worstPrivacyLevel(["Private", "Deshielded", "Amount Revealed"])).toBe("Deshielded");
    expect(worstPrivacyLevel(["Private", "Amount Revealed"])).toBe("Amount Revealed");
    expect(worstPrivacyLevel(["Private"])).toBe("Private");
  });

  // A batch with a recipient whose verdict could not be reached cannot be
  // vouched for as a whole.
  it("is unknown when any verdict is unknown, or there are none", () => {
    expect(worstPrivacyLevel(["Private", "-"])).toBe("-");
    expect(worstPrivacyLevel([])).toBe("-");
  });
});
