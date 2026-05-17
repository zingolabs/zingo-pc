import React from "react";
import { render, screen, fireEvent } from "../test-utils";
import ShieldResultContent from "./ShieldResultContent";
import { BlockExplorerEnum, ServerChainNameEnum } from "../components/appstate";

jest.mock("../electronBridge");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { shell } = require("../electronBridge");

const baseProps = {
  txids: ["txid-aaaa"],
  chainName: ServerChainNameEnum.mainChainName,
  blockExplorerTransaction: BlockExplorerEnum.Zcashexplorer,
  blockExplorerTransactionCustom: "",
};

describe("ShieldResultContent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("uses singular wording when there is one txid", () => {
    render(<ShieldResultContent {...baseProps} />);
    expect(screen.getByText(/Transaction was successfully broadcast/)).toBeInTheDocument();
    expect(screen.getByText("TXID: txid-aaaa")).toBeInTheDocument();
  });

  it("uses plural wording when there is more than one txid", () => {
    render(<ShieldResultContent {...baseProps} txids={["txid-1", "txid-2", "txid-3"]} />);
    expect(screen.getByText(/Transactions were successfully broadcast/)).toBeInTheDocument();
    expect(screen.getByText("TXID: txid-1")).toBeInTheDocument();
    expect(screen.getByText("TXID: txid-2")).toBeInTheDocument();
    expect(screen.getByText("TXID: txid-3")).toBeInTheDocument();
  });

  it("shows View TXID buttons for each txid on a non-regtest chain", () => {
    render(<ShieldResultContent {...baseProps} txids={["a", "b"]} />);
    expect(screen.getAllByText(/View TXID/)).toHaveLength(2);
  });

  it("hides the explorer buttons on regtest", () => {
    render(<ShieldResultContent {...baseProps} chainName={ServerChainNameEnum.regtestChainName} />);
    expect(screen.queryByText(/View TXID/)).not.toBeInTheDocument();
  });

  it("opens the right explorer URL when View TXID is clicked (mainnet zcashexplorer)", () => {
    render(<ShieldResultContent {...baseProps} txids={["abc123"]} />);
    fireEvent.click(screen.getByText(/View TXID/));
    expect(shell.openExternal).toHaveBeenCalledWith("https://mainnet.zcashexplorer.app/transactions/abc123");
  });
});
