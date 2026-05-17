import React from "react";
import { render, screen, fireEvent } from "../../../test-utils";
import VtModalInternal from "./VtModal";
import {
  ValueTransferClass,
  ValueTransferKindEnum,
  ValueTransferStatusEnum,
} from "../../appstate";

jest.mock("../../../electronBridge");

beforeAll(() => {
  const div = document.createElement("div");
  div.setAttribute("id", "root");
  document.body.appendChild(div);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("react-modal").setAppElement("#root");
});

const sampleVt = new ValueTransferClass(
  ValueTransferKindEnum.sent,
  10,
  2_000_000,
  ValueTransferStatusEnum.confirmed,
  "abcdef1234567890",
  Math.floor(Date.now() / 1000),
  1.25,
  "u1somerecipient",
);

const baseProps = {
  index: 0,
  length: 1,
  totalLength: 1,
  vt: sampleVt,
  modalIsOpen: true,
  closeModal: jest.fn(),
  currencyName: "ZEC",
  addressBookMap: new Map<string, string>(),
  valueTransfersSliced: [sampleVt],
};

describe("VtModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders without crashing when open", () => {
    render(<VtModalInternal {...baseProps} />);
  });

  it("does not render content when closed", () => {
    render(<VtModalInternal {...baseProps} modalIsOpen={false} />);
    expect(screen.queryByRole("button", { name: /^cancel$/i })).not.toBeInTheDocument();
  });

  it("renders a Cancel button when open", () => {
    render(<VtModalInternal {...baseProps} />);
    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeInTheDocument();
  });

  it("calls closeModal when Cancel is clicked", () => {
    const closeModal = jest.fn();
    render(<VtModalInternal {...baseProps} closeModal={closeModal} />);
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    // react-modal can also fire onRequestClose via click bubbling in jsdom,
    // so we just assert it was called (could be 1 or 2 times).
    expect(closeModal).toHaveBeenCalled();
  });
});
