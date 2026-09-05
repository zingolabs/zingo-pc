import React from "react";
import { render, screen } from "../../test-utils";
import SelectWallet from "./SelectWallet";
import {
  WalletType,
  ServerChainNameEnum,
  CreationTypeEnum,
  PerformanceLevelEnum,
  ServerSelectionEnum,
} from "../appstate";

jest.mock("../../electronBridge");

const makeWallet = (id: number, alias: string, chain_name: ServerChainNameEnum): WalletType => ({
  id,
  alias,
  chain_name,
  uri: "https://server",
  fileName: "wallet.dat",
  creationType: CreationTypeEnum.Seed,
  performanceLevel: PerformanceLevelEnum.High,
  selection: ServerSelectionEnum.auto,
});

const currentWallet = makeWallet(1, "Main wallet", ServerChainNameEnum.mainChainName);

describe("SelectWallet", () => {
  it("renders no select when currentWallet is null", () => {
    render(<SelectWallet navigateToLoadingScreenChangingWallet={jest.fn()} />, {
      contextOverrides: { currentWallet: null },
    });
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("renders a select dropdown when currentWallet is set", () => {
    render(<SelectWallet navigateToLoadingScreenChangingWallet={jest.fn()} />, {
      contextOverrides: { currentWallet, wallets: [currentWallet] },
    });
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("shows a MAINNET optgroup with the wallet alias", () => {
    render(<SelectWallet navigateToLoadingScreenChangingWallet={jest.fn()} />, {
      contextOverrides: { currentWallet, wallets: [currentWallet] },
    });
    expect(screen.getByRole("option", { name: /main wallet/i })).toBeInTheDocument();
  });

  it("shows wallets from multiple chains in their respective optgroups", () => {
    const testWallet = makeWallet(2, "Test wallet", ServerChainNameEnum.testChainName);
    render(<SelectWallet navigateToLoadingScreenChangingWallet={jest.fn()} />, {
      contextOverrides: { currentWallet, wallets: [currentWallet, testWallet] },
    });
    expect(screen.getByRole("option", { name: /main wallet/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /test wallet/i })).toBeInTheDocument();
  });
});
