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
});
