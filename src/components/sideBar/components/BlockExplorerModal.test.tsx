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

  it("calls closeModal when Cancel is clicked", () => {
    const closeModal = jest.fn();
    render(<BlockExplorerModal {...baseProps} closeModal={closeModal} />);
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(closeModal).toHaveBeenCalledTimes(1);
  });

  it("renders both Mainnet and Testnet sections", () => {
    render(<BlockExplorerModal {...baseProps} />);
    expect(screen.getByText("Mainnet")).toBeInTheDocument();
    expect(screen.getByText("Testnet")).toBeInTheDocument();
  });

  it("saves explorer choices through ipcRenderer.invoke when Save is clicked", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ipcRenderer } = require("../../../electronBridge");
    (ipcRenderer.invoke as jest.Mock).mockResolvedValue(undefined);
    const setModalInput = jest.fn();
    const closeModal = jest.fn();
    render(
      <BlockExplorerModal {...baseProps} setModalInput={setModalInput} closeModal={closeModal} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    // setModalInput is called synchronously before the async invoke
    expect(setModalInput).toHaveBeenCalled();
    // Wait for the async chain
    await new Promise((r) => setTimeout(r, 30));
    expect(ipcRenderer.invoke).toHaveBeenCalledWith("saveSettings", expect.any(Object));
    expect(closeModal).toHaveBeenCalled();
  });

  it("disables Save when Custom is selected but URL is empty", () => {
    render(
      <BlockExplorerModal
        {...baseProps}
        modalInput={{ ...modalInput, blockExplorerMainnetTransaction: BlockExplorerEnum.Custom }}
      />,
    );
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
  });

  it("normalizes custom URLs to end in '/' on save", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ipcRenderer } = require("../../../electronBridge");
    (ipcRenderer.invoke as jest.Mock).mockResolvedValue(undefined);
    const setModalInput = jest.fn();
    render(
      <BlockExplorerModal
        {...baseProps}
        modalInput={{
          ...modalInput,
          blockExplorerMainnetTransaction: BlockExplorerEnum.Custom,
          blockExplorerMainnetTransactionCustom: "https://my.explorer/tx",
        }}
        setModalInput={setModalInput}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await new Promise((r) => setTimeout(r, 30));
    const saved = setModalInput.mock.calls[0][0];
    expect(saved.blockExplorerMainnetTransactionCustom).toBe("https://my.explorer/tx/");
  });

  it("preserves custom URLs that already end in '='", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ipcRenderer } = require("../../../electronBridge");
    (ipcRenderer.invoke as jest.Mock).mockResolvedValue(undefined);
    const setModalInput = jest.fn();
    render(
      <BlockExplorerModal
        {...baseProps}
        modalInput={{
          ...modalInput,
          blockExplorerMainnetTransaction: BlockExplorerEnum.Custom,
          blockExplorerMainnetTransactionCustom: "https://my.explorer/tx?hash=",
        }}
        setModalInput={setModalInput}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await new Promise((r) => setTimeout(r, 30));
    const saved = setModalInput.mock.calls[0][0];
    expect(saved.blockExplorerMainnetTransactionCustom).toBe("https://my.explorer/tx?hash=");
  });

  it("clears the custom field when the selection is not Custom", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ipcRenderer } = require("../../../electronBridge");
    (ipcRenderer.invoke as jest.Mock).mockResolvedValue(undefined);
    const setModalInput = jest.fn();
    render(
      <BlockExplorerModal
        {...baseProps}
        modalInput={{
          ...modalInput,
          blockExplorerMainnetTransactionCustom: "https://leftover.example/",
        }}
        setModalInput={setModalInput}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await new Promise((r) => setTimeout(r, 30));
    const saved = setModalInput.mock.calls[0][0];
    expect(saved.blockExplorerMainnetTransactionCustom).toBe("");
  });

  it("changes Mainnet Transactions selector to Custom and reveals the custom URL input", () => {
    render(<BlockExplorerModal {...baseProps} />);
    const select = screen.getByLabelText(/Block explorer for mainnet transactions$/i);
    fireEvent.change(select, { target: { value: BlockExplorerEnum.Custom } });
    expect(screen.getByLabelText(/Block explorer for mainnet transactions custom URL/i)).toBeInTheDocument();
  });
});
