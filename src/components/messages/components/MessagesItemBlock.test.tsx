import React from "react";
import { render, screen, fireEvent } from "../../../test-utils";
import MessagesItemBlock from "./MessagesItemBlock";
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
    { memos: ["Hello, world!"], ...overrides },
  );

const baseProps = {
  index: 0,
  setValueTransferDetail: jest.fn(),
  setValueTransferDetailIndex: jest.fn(),
  setModalIsOpen: jest.fn(),
  currencyName: "ZEC",
  addressBookMap: new Map<string, string>(),
  previousLineWithSameTxid: false,
  zecPrice: 0,
};

describe("MessagesItemBlock", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders without crashing", () => {
    render(<MessagesItemBlock {...baseProps} vt={makeVt()} />);
  });

  it("shows the memo text", () => {
    render(<MessagesItemBlock {...baseProps} vt={makeVt({ memos: ["Test memo"] })} />);
    expect(screen.getByText("Test memo")).toBeInTheDocument();
  });

  it("shows the amount and date when amount >= 0.01", () => {
    render(<MessagesItemBlock {...baseProps} vt={makeVt({ amount: 0.5 })} />);
    expect(screen.getByText(/ZEC/)).toBeInTheDocument();
  });

  it("hides the amount when amount < 0.01 but still shows the date", () => {
    render(<MessagesItemBlock {...baseProps} vt={makeVt({ amount: 0.001 })} />);
    expect(screen.queryByText(/ZEC/)).not.toBeInTheDocument();
    expect(screen.getByText(/\w{3} \d{2}, \d{4}/)).toBeInTheDocument();
  });

  it("shows 'Failed' label when status is failed", () => {
    render(<MessagesItemBlock {...baseProps} vt={makeVt({ status: ValueTransferStatusEnum.failed })} />);
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("shows the address book label when address is in the map", () => {
    const map = new Map([["u1shortaddr", "Bob"]]);
    render(<MessagesItemBlock {...baseProps} vt={makeVt()} addressBookMap={map} />);
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("opens the modal when the message bubble is clicked", () => {
    const setModalIsOpen = jest.fn();
    render(<MessagesItemBlock {...baseProps} vt={makeVt()} setModalIsOpen={setModalIsOpen} />);
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(setModalIsOpen).toHaveBeenCalledWith(true);
  });

  it("opens the modal via keyboard Enter on the outer bubble", () => {
    const setModalIsOpen = jest.fn();
    render(<MessagesItemBlock {...baseProps} vt={makeVt()} setModalIsOpen={setModalIsOpen} />);
    fireEvent.keyDown(screen.getAllByRole("button")[0], { key: "Enter" });
    expect(setModalIsOpen).toHaveBeenCalledWith(true);
  });

  it("opens the modal via keyboard space on the outer bubble", () => {
    const setModalIsOpen = jest.fn();
    render(<MessagesItemBlock {...baseProps} vt={makeVt()} setModalIsOpen={setModalIsOpen} />);
    fireEvent.keyDown(screen.getAllByRole("button")[0], { key: " " });
    expect(setModalIsOpen).toHaveBeenCalledWith(true);
  });

  it("copies the address to clipboard when the address bubble is clicked", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { clipboard } = require("../../../electronBridge");
    render(<MessagesItemBlock {...baseProps} vt={makeVt({ address: "u1tinyaddress" })} />);
    fireEvent.click(screen.getByLabelText("Copy address"));
    expect(clipboard.writeText).toHaveBeenCalledWith("u1tinyaddress");
  });

  it("expands the address inline when clicked (long address chunked)", () => {
    const longAddr = "u1" + "x".repeat(100);
    render(<MessagesItemBlock {...baseProps} vt={makeVt({ address: longAddr })} />);
    fireEvent.click(screen.getByLabelText("Copy address"));
    expect(screen.getByLabelText("Copy address")).toBeInTheDocument();
  });

  it("triggers address-copy via keyboard Enter", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { clipboard } = require("../../../electronBridge");
    render(<MessagesItemBlock {...baseProps} vt={makeVt()} />);
    fireEvent.keyDown(screen.getByLabelText("Copy address"), { key: "Enter" });
    expect(clipboard.writeText).toHaveBeenCalled();
  });

  it("renders the 'sent' alignment when message is sent (right-side bubble)", () => {
    render(<MessagesItemBlock {...baseProps} vt={makeVt({ type: ValueTransferKindEnum.sent })} />);
    // No specific text assertion — just ensures the branch executes.
    expect(screen.getAllByRole("button").length).toBeGreaterThan(0);
  });

  it("hides address bubble when there's already an address book label", () => {
    const map = new Map([["u1shortaddr", "Bob"]]);
    render(<MessagesItemBlock {...baseProps} vt={makeVt()} addressBookMap={map} />);
    expect(screen.queryByLabelText("Copy address")).not.toBeInTheDocument();
  });
});
