import React from "react";
import { screen, fireEvent } from "@testing-library/react";
import { render } from "../../../test-utils";
import SendConfirmModal from "./SendConfirmModal";
import { SendPageStateClass, ToAddrClass, InfoClass, TotalBalanceClass } from "../../appstate";

jest.mock("../../../electronBridge");

// Modal renders into document.body — set the app element to avoid the warning
beforeAll(() => {
  const div = document.createElement("div");
  div.setAttribute("id", "root");
  document.body.appendChild(div);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("react-modal").setAppElement("#root");
});

const makeProps = (overrides: {
  closeModal?: () => void;
  sendTransaction?: () => Promise<string>;
  clearToAddrs?: () => void;
  modalIsOpen?: boolean;
}) => {
  const sendPageState = new SendPageStateClass();
  sendPageState.toaddr = Object.assign(new ToAddrClass(), {
    to: "u1fakeaddress0000000000000000000000000000000000000000",
    amount: 1,
    memo: "",
    memoReplyTo: "",
  });

  return {
    sendPageState,
    totalBalance: new TotalBalanceClass(),
    info: new InfoClass(),
    sendTransaction: overrides.sendTransaction ?? jest.fn().mockResolvedValue("abc123"),
    clearToAddrs: overrides.clearToAddrs ?? jest.fn(),
    closeModal: overrides.closeModal ?? jest.fn(),
    modalIsOpen: overrides.modalIsOpen ?? true,
    sendFee: 0.0001,
    currencyName: "ZEC",
  };
};

describe("SendConfirmModal", () => {
  it("renders when open", () => {
    render(<SendConfirmModal {...makeProps({})} />);
    expect(screen.getByText("Confirm Transaction")).toBeInTheDocument();
  });

  it("calls closeModal when Cancel is clicked", () => {
    const closeModal = jest.fn();
    render(<SendConfirmModal {...makeProps({ closeModal })} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(closeModal).toHaveBeenCalledTimes(1);
  });

  it("does not render modal content when closed", () => {
    render(<SendConfirmModal {...makeProps({ modalIsOpen: false })} />);
    expect(screen.queryByText("Confirm Transaction")).not.toBeInTheDocument();
  });

  it("shows Cancel button before Send button", () => {
    render(<SendConfirmModal {...makeProps({})} />);
    const buttons = screen.getAllByRole("button");
    const cancelIdx = buttons.findIndex((b) => /cancel/i.test(b.textContent ?? ""));
    const sendIdx = buttons.findIndex((b) => /^send$/i.test(b.textContent ?? ""));
    expect(cancelIdx).toBeLessThan(sendIdx);
  });
});
