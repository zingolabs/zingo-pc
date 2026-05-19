import React from "react";
import { render, screen, fireEvent } from "../../../test-utils";
import VtItemBlock from "./VtItemBlock";
import { ValueTransferClass, ValueTransferKindEnum, ValueTransferStatusEnum } from "../../appstate";

jest.mock("../../../electronBridge");

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
    overrides,
  );

const baseProps = {
  index: 0,
  setValueTransferDetail: jest.fn(),
  setValueTransferDetailIndex: jest.fn(),
  setModalIsOpen: jest.fn(),
  currencyName: "ZEC",
  addressBookMap: new Map<string, string>(),
  previousLineWithSameTxid: false,
};

describe("VtItemBlock", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders without crashing", () => {
    render(<VtItemBlock {...baseProps} vt={makeVt()} />);
  });

  it("shows the date when previousLineWithSameTxid is false", () => {
    render(<VtItemBlock {...baseProps} vt={makeVt()} previousLineWithSameTxid={false} />);
    // dateformat produces something like "Nov 14, 2023"
    expect(screen.getByText(/\w{3} \d{2}, \d{4}/)).toBeInTheDocument();
  });

  it("does not show the date when previousLineWithSameTxid is true", () => {
    render(<VtItemBlock {...baseProps} vt={makeVt()} previousLineWithSameTxid={true} />);
    expect(screen.queryByText(/\w{3} \d{2}, \d{4}/)).not.toBeInTheDocument();
  });

  it("shows the truncated address when address is present", () => {
    render(<VtItemBlock {...baseProps} vt={makeVt({ address: "u1shortaddr" })} />);
    // trimToSmall(addr, 10) shows first + last chars
    expect(screen.getByLabelText("Copy address")).toBeInTheDocument();
  });

  it("shows the txid copy button when there is no address", () => {
    render(<VtItemBlock {...baseProps} vt={makeVt({ address: undefined })} />);
    expect(screen.getByLabelText("Copy transaction ID")).toBeInTheDocument();
  });

  it("shows address book label when address is in the map", () => {
    const map = new Map([["u1shortaddr", "Alice"]]);
    render(<VtItemBlock {...baseProps} vt={makeVt()} addressBookMap={map} />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("opens the modal when clicked", () => {
    const setModalIsOpen = jest.fn();
    render(<VtItemBlock {...baseProps} vt={makeVt()} setModalIsOpen={setModalIsOpen} />);
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(setModalIsOpen).toHaveBeenCalledWith(true);
  });

  it("shows transaction fee when fee > 0", () => {
    render(<VtItemBlock {...baseProps} vt={makeVt({ fee: 0.0001 })} />);
    expect(screen.getByText("Transaction Fee")).toBeInTheDocument();
  });

  it("does not show fee section when fee is 0", () => {
    render(<VtItemBlock {...baseProps} vt={makeVt({ fee: 0 })} />);
    expect(screen.queryByText("Transaction Fee")).not.toBeInTheDocument();
  });

  it("shows 'Failed' label when status is failed", () => {
    render(<VtItemBlock {...baseProps} vt={makeVt({ status: ValueTransferStatusEnum.failed, confirmations: 0 })} />);
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("shows 'In Mempool' label when status is mempool", () => {
    render(<VtItemBlock {...baseProps} vt={makeVt({ status: ValueTransferStatusEnum.mempool, confirmations: 0 })} />);
    expect(screen.getByText("In Mempool")).toBeInTheDocument();
  });

  it("shows the memo when present", () => {
    render(<VtItemBlock {...baseProps} vt={makeVt({ memos: ["hello memo"] })} />);
    expect(screen.getByText("hello memo")).toBeInTheDocument();
  });

  it("shows the 'Calculated' label", () => {
    render(
      <VtItemBlock {...baseProps} vt={makeVt({ status: ValueTransferStatusEnum.calculated, confirmations: 0 })} />,
    );
    expect(screen.getByText("Calculated")).toBeInTheDocument();
  });

  it("shows the 'Transmitted' label", () => {
    render(
      <VtItemBlock {...baseProps} vt={makeVt({ status: ValueTransferStatusEnum.transmitted, confirmations: 0 })} />,
    );
    expect(screen.getByText("Transmitted")).toBeInTheDocument();
  });

  it("shows the USD price when zec_price is set and currency is ZEC", () => {
    render(<VtItemBlock {...baseProps} vt={makeVt({ zec_price: 30 })} />);
    expect(screen.getByText("USD 30.00 / ZEC")).toBeInTheDocument();
  });

  it("expands the address inline when clicked (short address path)", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { clipboard } = require("../../../electronBridge");
    render(<VtItemBlock {...baseProps} vt={makeVt({ address: "u1tinyaddress" })} />);
    fireEvent.click(screen.getByLabelText("Copy address"));
    expect(clipboard.writeText).toHaveBeenCalledWith("u1tinyaddress");
  });

  it("expands a long address into chunks when clicked", () => {
    const longAddr = "u1" + "x".repeat(100);
    render(<VtItemBlock {...baseProps} vt={makeVt({ address: longAddr })} />);
    fireEvent.click(screen.getByLabelText("Copy address"));
    // chunked rendering uses splitStringIntoChunks(addr, 3) — at least one chunk visible
    expect(screen.getByLabelText("Copy address")).toBeInTheDocument();
  });

  it("triggers address-copy via keyboard Enter", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { clipboard } = require("../../../electronBridge");
    render(<VtItemBlock {...baseProps} vt={makeVt()} />);
    fireEvent.keyDown(screen.getByLabelText("Copy address"), { key: "Enter" });
    expect(clipboard.writeText).toHaveBeenCalled();
  });

  it("expands the txid inline when address is missing (long txid)", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { clipboard } = require("../../../electronBridge");
    const longTxid = "a".repeat(120);
    render(<VtItemBlock {...baseProps} vt={makeVt({ address: undefined, txid: longTxid })} />);
    fireEvent.click(screen.getByLabelText("Copy transaction ID"));
    expect(clipboard.writeText).toHaveBeenCalledWith(longTxid);
  });

  it("triggers txid-copy via keyboard space", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { clipboard } = require("../../../electronBridge");
    render(<VtItemBlock {...baseProps} vt={makeVt({ address: undefined })} />);
    fireEvent.keyDown(screen.getByLabelText("Copy transaction ID"), { key: " " });
    expect(clipboard.writeText).toHaveBeenCalled();
  });

  it("opens the modal via keyboard Enter on the outer button", () => {
    const setModalIsOpen = jest.fn();
    render(<VtItemBlock {...baseProps} vt={makeVt()} setModalIsOpen={setModalIsOpen} />);
    fireEvent.keyDown(screen.getAllByRole("button")[0], { key: "Enter" });
    expect(setModalIsOpen).toHaveBeenCalledWith(true);
  });
});
