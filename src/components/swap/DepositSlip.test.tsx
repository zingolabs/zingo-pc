import React from "react";
import { fireEvent, screen } from "@testing-library/react";
import { render } from "../../test-utils";
import DepositSlip from "./DepositSlip";
import { SwapDirectionEnum, SwapKitProviderEnum } from "../../swap";
import type { SwapAssetType } from "../../swap";

jest.mock("../../electronBridge");

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { shell } = require("../../electronBridge");

const ETH: SwapAssetType = {
  swapKitId: "ETH.ETH",
  chain: "ETH",
  symbol: "ETH",
  ticker: "ETH",
  chainId: "1",
  decimals: 18,
};

const BTC: SwapAssetType = {
  swapKitId: "BTC.BTC",
  chain: "BTC",
  symbol: "BTC",
  ticker: "BTC",
  chainId: "bitcoin",
  decimals: 8,
};

const MAYA_MEMO = "=:e:0xAA00000000000000000000000000000000000000:0/1/0";

const renderSlip = (props: Partial<React.ComponentProps<typeof DepositSlip>> = {}) => {
  const copy = jest.fn();
  render(
    <DepositSlip
      provider={SwapKitProviderEnum.MayachainStreaming}
      direction={SwapDirectionEnum.Inbound}
      sellAsset={ETH}
      depositAddress="0x1111111111111111111111111111111111111111"
      amountHumanDecimal="0.001"
      copy={copy}
      {...props}
    />,
  );
  return { copy };
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("DepositSlip", () => {
  it("shows the address and the exact amount with its ticker", () => {
    renderSlip();
    expect(screen.getByText("0x1111111111111111111111111111111111111111")).toBeInTheDocument();
    expect(screen.getByText("0.001 ETH")).toBeInTheDocument();
  });

  it("copies a row through the handler it was given", () => {
    const { copy } = renderSlip();
    fireEvent.click(screen.getByLabelText("Copy Deposit address"));
    expect(copy).toHaveBeenCalledWith("0x1111111111111111111111111111111111111111");
  });

  // The whole point of the per-chain hint: an EVM payer must be told about the
  // data field, because a wallet's default empty `data` is what stranded a
  // real deposit on 2026-06-27.
  it("tells an EVM payer to use the data field, and offers the memo pre-encoded", () => {
    renderSlip({ memoText: MAYA_MEMO });
    expect(screen.getByText(/data \(calldata\) field/)).toBeInTheDocument();
    expect(screen.getByText("Memo (hex calldata)")).toBeInTheDocument();
    expect(screen.getByText(/^0x3d3a/)).toBeInTheDocument();
  });

  it("tells a UTXO payer to use OP_RETURN, with no calldata row to confuse them", () => {
    renderSlip({ sellAsset: BTC, depositAddress: "bc1qexample", memoText: MAYA_MEMO });
    expect(screen.getByText(/OP_RETURN/)).toBeInTheDocument();
    expect(screen.queryByText("Memo (hex calldata)")).not.toBeInTheDocument();
  });

  // Maya routes whatever arrives; only the channel providers refund a short
  // payment, so only they earn the banner.
  it("warns about the exact amount for a channel provider", () => {
    renderSlip({ provider: SwapKitProviderEnum.Near });
    expect(screen.getByText(/Send EXACTLY this amount/)).toBeInTheDocument();
  });

  it("stays quiet about the exact amount for Maya", () => {
    renderSlip({ provider: SwapKitProviderEnum.MayachainStreaming });
    expect(screen.queryByText(/Send EXACTLY this amount/)).not.toBeInTheDocument();
  });

  it("opens the payment URI through the shell when the QR is openable", () => {
    renderSlip({ provider: SwapKitProviderEnum.Near });
    fireEvent.click(screen.getByText(/Open in a wallet/));
    expect(shell.openExternal).toHaveBeenCalledWith(
      "ethereum:0x1111111111111111111111111111111111111111@1?value=1000000000000000",
    );
  });

  // A UTXO memo cannot ride in a BIP-21 URI, so there is deliberately no QR
  // here: a code that looked complete while dropping the memo would be worse
  // than the copy rows.
  it("shows no QR when no URI can carry the memo", () => {
    renderSlip({ sellAsset: BTC, depositAddress: "bc1qexample", memoText: MAYA_MEMO });
    expect(screen.queryByText(/Open in a wallet/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Scan/)).not.toBeInTheDocument();
  });

  // Once this wallet has paid, a payment code is an invitation to pay twice.
  it("drops the QR once the deposit is paid", () => {
    renderSlip({ provider: SwapKitProviderEnum.Near, paid: true });
    expect(screen.queryByText(/Scan/)).not.toBeInTheDocument();
    expect(screen.getByText("Deposit address")).toBeInTheDocument();
  });

  it("shows the route expiry when the quote carried one", () => {
    renderSlip({ expiresAtMs: 1_800_000_000_000 });
    expect(screen.getByText("Send before")).toBeInTheDocument();
  });

  it("omits the expiry row entirely when the quote carried none", () => {
    renderSlip();
    expect(screen.queryByText("Send before")).not.toBeInTheDocument();
  });
});
