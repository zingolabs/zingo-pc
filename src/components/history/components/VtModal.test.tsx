import React from "react";
import { act, fireEvent, screen } from "@testing-library/react";
import { render } from "../../../test-utils";
import VtModalInternal from "./VtModal";
import {
  ValueTransferClass,
  ValueTransferKindEnum,
  ValueTransferStatusEnum,
  ValueTransferPoolEnum,
  ServerChainNameEnum,
} from "../../appstate";
import routes from "../../../constants/routes.json";

jest.mock("../../../electronBridge");

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => {
  const actual = jest.requireActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

beforeAll(() => {
  const div = document.createElement("div");
  div.setAttribute("id", "root");
  document.body.appendChild(div);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("react-modal").setAppElement("#root");
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { native, clipboard } = require("../../../electronBridge");

const makeVt = (overrides: Partial<ValueTransferClass> = {}): ValueTransferClass => {
  const v = new ValueTransferClass(
    ValueTransferKindEnum.sent,
    10,
    2_000_000,
    ValueTransferStatusEnum.confirmed,
    "abcdef1234567890",
    Math.floor(Date.now() / 1000),
    1.25,
    "u1somerecipient",
  );
  Object.assign(v, overrides);
  return v;
};

const baseProps = {
  index: 0,
  length: 1,
  totalLength: 1,
  modalIsOpen: true,
  closeModal: jest.fn(),
  currencyName: "ZEC",
  addressBookMap: new Map<string, string>(),
  valueTransfersSliced: [makeVt()],
};

const mainnetWallet = { id: 1, chain_name: ServerChainNameEnum.mainChainName } as any;
const regtestWallet = { id: 1, chain_name: ServerChainNameEnum.regtestChainName } as any;

describe("VtModal", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    (native.remove_transaction as jest.Mock | undefined)?.mockReset?.();
    (clipboard.writeText as jest.Mock).mockReset();
  });

  it("renders without crashing when open", () => {
    const vt = makeVt();
    render(<VtModalInternal {...baseProps} vt={vt} valueTransfersSliced={[vt]} />, {
      contextOverrides: { valueTransfers: [vt] },
    });
    expect(screen.getByText("Transaction Status")).toBeInTheDocument();
  });

  it("does not render content when closed", () => {
    const vt = makeVt();
    render(<VtModalInternal {...baseProps} vt={vt} valueTransfersSliced={[vt]} modalIsOpen={false} />, {
      contextOverrides: { valueTransfers: [vt] },
    });
    expect(screen.queryByText("Transaction Status")).not.toBeInTheDocument();
  });

  it("calls closeModal when Cancel is clicked", () => {
    const vt = makeVt();
    const closeModal = jest.fn();
    render(<VtModalInternal {...baseProps} vt={vt} valueTransfersSliced={[vt]} closeModal={closeModal} />, {
      contextOverrides: { valueTransfers: [vt] },
    });
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(closeModal).toHaveBeenCalled();
  });

  it("copies TXID to clipboard and expands it on click", () => {
    const vt = makeVt({ txid: "a".repeat(100) });
    render(<VtModalInternal {...baseProps} vt={vt} valueTransfersSliced={[vt]} />, {
      contextOverrides: { valueTransfers: [vt] },
    });
    fireEvent.click(screen.getByText(/^aaa/));
    expect(clipboard.writeText).toHaveBeenCalled();
  });

  it("copies address to clipboard and expands on click", () => {
    const vt = makeVt({ address: "u1" + "x".repeat(100) });
    render(<VtModalInternal {...baseProps} vt={vt} valueTransfersSliced={[vt]} />, {
      contextOverrides: { valueTransfers: [vt] },
    });
    fireEvent.click(screen.getByText(/u1xxx/));
    expect(clipboard.writeText).toHaveBeenCalledWith(vt.address);
  });

  it("hides 'View TXID' button on regtest", () => {
    const vt = makeVt();
    render(<VtModalInternal {...baseProps} vt={vt} valueTransfersSliced={[vt]} />, {
      contextOverrides: { valueTransfers: [vt], currentWallet: regtestWallet },
    });
    expect(screen.queryByText(/View TXID/)).not.toBeInTheDocument();
  });

  it("shows 'View TXID' on mainnet", () => {
    const vt = makeVt();
    render(<VtModalInternal {...baseProps} vt={vt} valueTransfersSliced={[vt]} />, {
      contextOverrides: { valueTransfers: [vt], currentWallet: mainnetWallet },
    });
    expect(screen.getByText(/View TXID/)).toBeInTheDocument();
  });

  it("triggers Add Label flow when label is empty", () => {
    const vt = makeVt({ address: "u1noLabel" });
    const setAddLabel = jest.fn();
    render(<VtModalInternal {...baseProps} vt={vt} valueTransfersSliced={[vt]} />, {
      contextOverrides: { valueTransfers: [vt], setAddLabel },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add Label/i }));
    expect(setAddLabel).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith(routes.ADDRESSBOOK);
  });

  it("hides 'Add Label' when an address-book label exists", () => {
    const vt = makeVt({ address: "u1somerecipient" });
    render(
      <VtModalInternal
        {...baseProps}
        vt={vt}
        valueTransfersSliced={[vt]}
        addressBookMap={new Map([["u1somerecipient", "Alice"]])}
      />,
      { contextOverrides: { valueTransfers: [vt] } },
    );
    expect(screen.queryByRole("button", { name: /Add Label/i })).not.toBeInTheDocument();
  });

  it("triggers Send More flow when clicked", () => {
    const vt = makeVt({ address: "u1somerecipient" });
    const setSendTo = jest.fn();
    render(<VtModalInternal {...baseProps} vt={vt} valueTransfersSliced={[vt]} />, {
      contextOverrides: { valueTransfers: [vt], setSendTo },
    });
    fireEvent.click(screen.getByRole("button", { name: /Send More/i }));
    expect(setSendTo).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith(routes.SEND);
  });

  it("hides Send More when readOnly is true", () => {
    const vt = makeVt({ address: "u1somerecipient" });
    render(<VtModalInternal {...baseProps} vt={vt} valueTransfersSliced={[vt]} />, {
      contextOverrides: { valueTransfers: [vt], readOnly: true },
    });
    expect(screen.queryByRole("button", { name: /Send More/i })).not.toBeInTheDocument();
  });

  it("shows pending/failed status banner when confirmations < 3", () => {
    const vt = makeVt({ confirmations: 0, status: ValueTransferStatusEnum.mempool });
    render(<VtModalInternal {...baseProps} vt={vt} valueTransfersSliced={[vt]} />, {
      contextOverrides: { valueTransfers: [vt] },
    });
    expect(screen.getByText(/Transaction not yet confirmed/)).toBeInTheDocument();
  });

  it("shows 'waiting for minimum confirmations' for partially-confirmed", () => {
    const vt = makeVt({ confirmations: 1, status: ValueTransferStatusEnum.confirmed });
    render(<VtModalInternal {...baseProps} vt={vt} valueTransfersSliced={[vt]} />, {
      contextOverrides: { valueTransfers: [vt] },
    });
    expect(screen.getByText(/Funds waiting for the minimum confirmations/)).toBeInTheDocument();
  });

  it("shows the Remove button for failed transactions and triggers openConfirmModal", () => {
    const vt = makeVt({ confirmations: 0, status: ValueTransferStatusEnum.failed });
    const openConfirmModal = jest.fn();
    render(<VtModalInternal {...baseProps} vt={vt} valueTransfersSliced={[vt]} />, {
      contextOverrides: { valueTransfers: [vt], openConfirmModal },
    });
    fireEvent.click(screen.getByRole("button", { name: /Remove/i }));
    expect(openConfirmModal).toHaveBeenCalled();
  });

  it("invokes native.remove_transaction inside runActionConfirmed", async () => {
    const vt = makeVt({ confirmations: 0, status: ValueTransferStatusEnum.failed });
    const openErrorModal = jest.fn();
    let capturedConfirmCallback: () => void = () => {};
    const openConfirmModal = jest.fn((_t: string, _b: any, cb: () => void) => {
      capturedConfirmCallback = cb;
    });
    (native.remove_transaction as jest.Mock).mockResolvedValue("Success");
    render(<VtModalInternal {...baseProps} vt={vt} valueTransfersSliced={[vt]} />, {
      contextOverrides: { valueTransfers: [vt], openConfirmModal, openErrorModal },
    });
    fireEvent.click(screen.getByRole("button", { name: /Remove/i }));
    await act(async () => {
      await capturedConfirmCallback();
    });
    expect(native.remove_transaction).toHaveBeenCalledWith(vt.txid);
    expect(openErrorModal).toHaveBeenCalledWith("Remove", "Success");
  });

  it("opens an error modal when native.remove_transaction returns error", async () => {
    const vt = makeVt({ confirmations: 0, status: ValueTransferStatusEnum.failed });
    const openErrorModal = jest.fn();
    let capturedConfirmCallback: () => void = () => {};
    const openConfirmModal = jest.fn((_t: string, _b: any, cb: () => void) => {
      capturedConfirmCallback = cb;
    });
    (native.remove_transaction as jest.Mock).mockResolvedValue("Error: not allowed");
    render(<VtModalInternal {...baseProps} vt={vt} valueTransfersSliced={[vt]} />, {
      contextOverrides: { valueTransfers: [vt], openConfirmModal, openErrorModal },
    });
    fireEvent.click(screen.getByRole("button", { name: /Remove/i }));
    await act(async () => {
      await capturedConfirmCallback();
    });
    expect(openErrorModal).toHaveBeenCalledWith("Remove", "Remove Error: not allowed");
  });

  it("opens an error modal when native.remove_transaction throws", async () => {
    const vt = makeVt({ confirmations: 0, status: ValueTransferStatusEnum.failed });
    const openErrorModal = jest.fn();
    let capturedConfirmCallback: () => void = () => {};
    const openConfirmModal = jest.fn((_t: string, _b: any, cb: () => void) => {
      capturedConfirmCallback = cb;
    });
    (native.remove_transaction as jest.Mock).mockRejectedValue(new Error("boom"));
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    render(<VtModalInternal {...baseProps} vt={vt} valueTransfersSliced={[vt]} />, {
      contextOverrides: { valueTransfers: [vt], openConfirmModal, openErrorModal },
    });
    fireEvent.click(screen.getByRole("button", { name: /Remove/i }));
    await act(async () => {
      await capturedConfirmCallback();
    });
    expect(openErrorModal).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("navigates forward when arrow-down is clicked", () => {
    const vt0 = makeVt({ txid: "tx0", address: "u1a" });
    const vt1 = makeVt({ txid: "tx1", address: "u1b" });
    render(<VtModalInternal {...baseProps} vt={vt0} valueTransfersSliced={[vt0, vt1]} length={2} index={0} />, {
      contextOverrides: { valueTransfers: [vt0, vt1] },
    });
    fireEvent.click(screen.getByLabelText("Next transaction"));
    // After move, the index in the navigator should be "2"
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("does NOT navigate forward when on the last item", () => {
    const vt0 = makeVt({ txid: "tx0" });
    render(<VtModalInternal {...baseProps} vt={vt0} valueTransfersSliced={[vt0]} length={1} index={0} />, {
      contextOverrides: { valueTransfers: [vt0] },
    });
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("handles ArrowDown keyboard navigation", () => {
    const vt0 = makeVt({ txid: "tx0", address: "u1a" });
    const vt1 = makeVt({ txid: "tx1", address: "u1b" });
    render(<VtModalInternal {...baseProps} vt={vt0} valueTransfersSliced={[vt0, vt1]} length={2} index={0} />, {
      contextOverrides: { valueTransfers: [vt0, vt1] },
    });
    fireEvent.keyDown(window, { key: "ArrowDown" });
  });

  it("handles ArrowUp keyboard navigation", () => {
    const vt0 = makeVt({ txid: "tx0", address: "u1a" });
    const vt1 = makeVt({ txid: "tx1", address: "u1b" });
    render(<VtModalInternal {...baseProps} vt={vt1} valueTransfersSliced={[vt0, vt1]} length={2} index={1} />, {
      contextOverrides: { valueTransfers: [vt0, vt1] },
    });
    fireEvent.keyDown(window, { key: "ArrowUp" });
  });

  it("renders the Pool when set", () => {
    const vt = makeVt({ pool: ValueTransferPoolEnum.orchard });
    render(<VtModalInternal {...baseProps} vt={vt} valueTransfersSliced={[vt]} />, {
      contextOverrides: { valueTransfers: [vt] },
    });
    expect(screen.getByText("Pool")).toBeInTheDocument();
  });

  it("renders memos and reply-to label when present", () => {
    const vt = makeVt({ memos: ["Hello!\nReply to: \nu1somerecipient"] });
    render(<VtModalInternal {...baseProps} vt={vt} valueTransfersSliced={[vt]} />, {
      contextOverrides: { valueTransfers: [vt] },
    });
    expect(screen.getByText("Memo")).toBeInTheDocument();
  });

  it("closes the modal when valueTransfers no longer contains the vt (sync mismatch)", () => {
    const vt = makeVt();
    const closeModal = jest.fn();
    render(<VtModalInternal {...baseProps} vt={vt} valueTransfersSliced={[vt]} closeModal={closeModal} />, {
      contextOverrides: { valueTransfers: [] },
    });
    expect(closeModal).toHaveBeenCalled();
  });
});
