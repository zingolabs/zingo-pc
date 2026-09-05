import React from "react";
import { render, screen } from "../../test-utils";
import WalletBar from "./WalletBar";
import {
  WalletType,
  ServerChainNameEnum,
  CreationTypeEnum,
  PerformanceLevelEnum,
  ServerSelectionEnum,
} from "../appstate";

jest.mock("../../electronBridge");
jest.mock("../../utils/fetchServerList");

const wallet: WalletType = {
  id: 1,
  alias: "Main wallet",
  chain_name: ServerChainNameEnum.mainChainName,
  uri: "https://zec.rocks:443",
  fileName: "wallet.dat",
  creationType: CreationTypeEnum.Seed,
  performanceLevel: PerformanceLevelEnum.High,
  selection: ServerSelectionEnum.auto,
};

const show = (overrides: Record<string, unknown>) =>
  render(<WalletBar navigateToLoadingScreenChangingWallet={jest.fn()} />, { contextOverrides: overrides });

describe("WalletBar", () => {
  it("states the wallet and the server on one line", () => {
    show({ currentWallet: wallet, wallets: [wallet] });
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Active server health" })).toBeInTheDocument();
  });

  // A selector with nothing to select is not a control, and the one action
  // worth offering then is the Dashboard's own Add New Wallet button.
  it("renders nothing at all with no wallet", () => {
    const { container } = show({ currentWallet: null, wallets: [] });
    expect(container).toBeEmptyDOMElement();
  });

  // `currentWallet` starts as an empty object before a real one loads, which
  // is the state the loading screen sits in.
  it("renders nothing while a wallet is still loading", () => {
    const { container } = show({ currentWallet: {} as WalletType, wallets: [] });
    expect(container).toBeEmptyDOMElement();
  });

  // The selector is the way out of an unopenable wallet, so it stays. The
  // health of a server this wallet never reached is not worth asserting.
  it("keeps the selector but drops the server line when the wallet will not open", () => {
    show({ currentWallet: wallet, wallets: [wallet], currentWalletOpenError: "corrupt wallet file" });
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Active server health" })).not.toBeInTheDocument();
  });
});
