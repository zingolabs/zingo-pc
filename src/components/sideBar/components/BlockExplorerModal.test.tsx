import React from "react";
import { render, screen, fireEvent } from "../../../test-utils";
import BlockExplorerModal from "./BlockExplorerModal";
import { BlockExplorerEnum } from "../../appstate";
import { ContextApp, defaultAppState } from "../../../context/ContextAppState";

beforeAll(() => {
  const div = document.createElement("div");
  div.setAttribute("id", "root");
  document.body.appendChild(div);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("react-modal").setAppElement("#root");
});

// Default block explorer values used by most tests. Individual tests can
// override any subset by spreading and overriding when building `contextValue`.
const defaultBlockExplorerValues = {
  blockExplorerMainnetTransaction: BlockExplorerEnum.Zcashexplorer,
  blockExplorerTestnetTransaction: BlockExplorerEnum.Zcashexplorer,
  blockExplorerMainnetAddress: BlockExplorerEnum.Zcashexplorer,
  blockExplorerTestnetAddress: BlockExplorerEnum.Zcashexplorer,
  blockExplorerMainnetTransactionCustom: "",
  blockExplorerTestnetTransactionCustom: "",
  blockExplorerMainnetAddressCustom: "",
  blockExplorerTestnetAddressCustom: "",
};

type RenderOpts = {
  modalIsOpen?: boolean;
  closeModal?: () => void;
  modalTitle?: string;
  setBlockExplorer?: jest.Mock;
  blockExplorerValues?: Partial<typeof defaultBlockExplorerValues>;
};

const renderModal = (opts: RenderOpts = {}) => {
  const {
    modalIsOpen = true,
    closeModal = jest.fn(),
    modalTitle = "Block Explorer Settings",
    setBlockExplorer = jest.fn(),
    blockExplorerValues = {},
  } = opts;

  const contextValue = {
    ...defaultAppState,
    ...defaultBlockExplorerValues,
    ...blockExplorerValues,
    setBlockExplorer,
  };

  return {
    setBlockExplorer,
    closeModal,
    ...render(
      <ContextApp.Provider value={contextValue}>
        <BlockExplorerModal modalIsOpen={modalIsOpen} closeModal={closeModal} modalTitle={modalTitle} />
      </ContextApp.Provider>,
    ),
  };
};

describe("BlockExplorerModal", () => {
  it("renders the modal title", () => {
    renderModal();
    expect(screen.getByText("Block Explorer Settings")).toBeInTheDocument();
  });

  it("renders when closed without showing content", () => {
    renderModal({ modalIsOpen: false });
    expect(screen.queryByText("Block Explorer Settings")).not.toBeInTheDocument();
  });

  it("calls closeModal when Cancel is clicked", () => {
    const { closeModal } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(closeModal).toHaveBeenCalledTimes(1);
  });

  it("renders both Mainnet and Testnet sections", () => {
    renderModal();
    expect(screen.getByText("Mainnet")).toBeInTheDocument();
    expect(screen.getByText("Testnet")).toBeInTheDocument();
  });

  it("calls setBlockExplorer with the form values when Save is clicked", () => {
    const { setBlockExplorer, closeModal } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(setBlockExplorer).toHaveBeenCalledTimes(1);
    expect(setBlockExplorer).toHaveBeenCalledWith(expect.objectContaining(defaultBlockExplorerValues));
    expect(closeModal).toHaveBeenCalled();
  });

  it("disables Save when Custom is selected but URL is empty", () => {
    renderModal({
      blockExplorerValues: { blockExplorerMainnetTransaction: BlockExplorerEnum.Custom },
    });
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
  });

  it("normalizes custom URLs to end in '/' on save", () => {
    const { setBlockExplorer } = renderModal({
      blockExplorerValues: {
        blockExplorerMainnetTransaction: BlockExplorerEnum.Custom,
        blockExplorerMainnetTransactionCustom: "https://my.explorer/tx",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    const saved = setBlockExplorer.mock.calls[0][0];
    expect(saved.blockExplorerMainnetTransactionCustom).toBe("https://my.explorer/tx/");
  });

  it("preserves custom URLs that already end in '='", () => {
    const { setBlockExplorer } = renderModal({
      blockExplorerValues: {
        blockExplorerMainnetTransaction: BlockExplorerEnum.Custom,
        blockExplorerMainnetTransactionCustom: "https://my.explorer/tx?hash=",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    const saved = setBlockExplorer.mock.calls[0][0];
    expect(saved.blockExplorerMainnetTransactionCustom).toBe("https://my.explorer/tx?hash=");
  });

  it("clears the custom field when the selection is not Custom", () => {
    const { setBlockExplorer } = renderModal({
      blockExplorerValues: { blockExplorerMainnetTransactionCustom: "https://leftover.example/" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    const saved = setBlockExplorer.mock.calls[0][0];
    expect(saved.blockExplorerMainnetTransactionCustom).toBe("");
  });

  it("changes Mainnet Transactions selector to Custom and reveals the custom URL input", () => {
    renderModal();
    const select = screen.getByLabelText(/Block explorer for mainnet transactions$/i);
    fireEvent.change(select, { target: { value: BlockExplorerEnum.Custom } });
    expect(screen.getByLabelText(/Block explorer for mainnet transactions custom URL/i)).toBeInTheDocument();
  });
});
