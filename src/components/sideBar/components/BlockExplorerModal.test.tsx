import React from "react";
import { render, screen, fireEvent } from "../../../test-utils";
import BlockExplorerModal from "./BlockExplorerModal";
import { BlockExplorerEnum } from "../../appstate";

jest.mock("../../../electronBridge");

beforeAll(() => {
  const div = document.createElement("div");
  div.setAttribute("id", "root");
  document.body.appendChild(div);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("react-modal").setAppElement("#root");
});

const modalInput = {
  blockExplorerMainnetTransaction: BlockExplorerEnum.Zcashexplorer,
  blockExplorerTestnetTransaction: BlockExplorerEnum.Zcashexplorer,
  blockExplorerMainnetAddress: BlockExplorerEnum.Zcashexplorer,
  blockExplorerTestnetAddress: BlockExplorerEnum.Zcashexplorer,
  blockExplorerMainnetTransactionCustom: "",
  blockExplorerTestnetTransactionCustom: "",
  blockExplorerMainnetAddressCustom: "",
  blockExplorerTestnetAddressCustom: "",
};

const baseProps = {
  modalIsOpen: true,
  modalInput,
  setModalInput: jest.fn(),
  closeModal: jest.fn(),
  modalTitle: "Block Explorer Settings",
};

describe("BlockExplorerModal", () => {
  it("renders the modal title", () => {
    render(<BlockExplorerModal {...baseProps} />);
    expect(screen.getByText("Block Explorer Settings")).toBeInTheDocument();
  });

  it("renders when closed without showing content", () => {
    render(<BlockExplorerModal {...baseProps} modalIsOpen={false} />);
    expect(screen.queryByText("Block Explorer Settings")).not.toBeInTheDocument();
  });

  it("calls closeModal when Close is clicked", () => {
    const closeModal = jest.fn();
    render(<BlockExplorerModal {...baseProps} closeModal={closeModal} />);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(closeModal).toHaveBeenCalledTimes(1);
  });
});
