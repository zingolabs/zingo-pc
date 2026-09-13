import React from "react";
import { screen } from "@testing-library/react";
import { render } from "../../test-utils";
import SwapDetailModal from "./SwapDetailModal";
import { SwapDirectionEnum, SwapKitProviderEnum, SwapStatusEnum } from "../../swap";
import type { SwapAssetType, SwapRecordType } from "../../swap";

jest.mock("../../electronBridge");

beforeAll(() => {
  const div = document.createElement("div");
  div.setAttribute("id", "root");
  document.body.appendChild(div);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("react-modal").setAppElement("#root");
});

const ZEC: SwapAssetType = {
  swapKitId: "ZEC.ZEC",
  chain: "ZEC",
  symbol: "ZEC",
  ticker: "ZEC",
  chainId: "zcash",
  decimals: 8,
};

const USDC: SwapAssetType = {
  swapKitId: "SOL.USDC",
  chain: "SOL",
  symbol: "USDC",
  ticker: "USDC",
  chainId: "solana",
  decimals: 6,
};

const record = (overrides: Partial<SwapRecordType> = {}): SwapRecordType => ({
  recordId: "rec-1",
  depositAddress: "t1FlashnetDepositPlaceholder",
  provider: SwapKitProviderEnum.Flashnet,
  direction: SwapDirectionEnum.Outbound,
  routeId: "route-1",
  sellAsset: ZEC,
  receiveAsset: USDC,
  sellAmountHumanDecimal: "0.007",
  expectedReceiveAmount: "7.77",
  minReceiveAmount: "7.69",
  destinationAddress: "SoLdestination",
  sourceAddress: "t1EphemeralSourcePlaceholder",
  status: SwapStatusEnum.Pending,
  providerData: { kind: SwapKitProviderEnum.Flashnet, vaultAddress: "t1FlashnetDepositPlaceholder" },
  fiatValueBasis: { sellUsdUnitPrice: 1150, receiveUsdUnitPrice: 1, capturedAt: 0 },
  createdAtMs: 1_700_000_000_000,
  updatedAtMs: 1_700_000_000_000,
  ...overrides,
});

const renderDetail = (overrides: Partial<SwapRecordType> = {}) =>
  render(
    <SwapDetailModal
      record={record(overrides)}
      index={0}
      length={1}
      moveDetail={jest.fn()}
      modalIsOpen
      closeModal={jest.fn()}
      onRemove={jest.fn()}
    />,
  );

/**
 * A swap that ended badly has to say so on the screen the user opens to find
 * out why. The reason is the provider's to give and often missing — SwapKit
 * omits `refundReason` when the provider gave none, which is what a Flashnet
 * refund did on mainnet on 2026-09-12 — so the status, not
 * the text, is what decides that there is an ending to report.
 */
// The tolerance a swap ran under once decided a refund investigation and was
// recorded nowhere, so it could only be guessed.
describe("SwapDetailModal slippage", () => {
  it("shows the tolerance and what the swap came to", () => {
    renderDetail({
      status: SwapStatusEnum.Completed,
      requestedSlippageBps: 100,
      slippageToleranceBps: 100,
      realizedSlippageBps: -6,
    });

    expect(screen.getByText("Slippage tolerance")).toBeInTheDocument();
    expect(screen.getByText("1%")).toBeInTheDocument();
    expect(screen.getByText("Received 0.06% more than expected")).toBeInTheDocument();
  });

  it("shows both tolerances when the provider applied another", () => {
    renderDetail({ requestedSlippageBps: 100, slippageToleranceBps: 200 });

    expect(screen.getByText("2% (1% requested)")).toBeInTheDocument();
  });

  it("shows nothing for a record made before either was kept", () => {
    renderDetail();

    expect(screen.queryByText("Slippage tolerance")).not.toBeInTheDocument();
    expect(screen.queryByText("Actual slippage")).not.toBeInTheDocument();
  });
});

describe("SwapDetailModal ending", () => {
  it("reports a refund the provider gave no reason for", () => {
    renderDetail({ status: SwapStatusEnum.Refunded });

    expect(screen.getByText("Refund")).toBeInTheDocument();
    expect(screen.getByText("Reason")).toBeInTheDocument();
    expect(screen.getByText(/Not given by Flashnet/)).toBeInTheDocument();
  });

  it("shows the provider words when there are some", () => {
    renderDetail({
      status: SwapStatusEnum.Refunded,
      refundInfo: { refundReason: "deposit_source_mismatch" },
    });

    expect(screen.getByText("Refund")).toBeInTheDocument();
    expect(screen.getByText("deposit_source_mismatch")).toBeInTheDocument();
    expect(screen.queryByText(/Not given by/)).not.toBeInTheDocument();
  });

  it("calls a failure a failure", () => {
    renderDetail({ status: SwapStatusEnum.Failed, failureReason: "route expired" });

    expect(screen.getByText("Failure")).toBeInTheDocument();
    expect(screen.getByText("route expired")).toBeInTheDocument();
    expect(screen.queryByText("Refund")).not.toBeInTheDocument();
  });

  it("says nothing about an ending on a swap still running", () => {
    renderDetail({ status: SwapStatusEnum.Pending });

    expect(screen.queryByText("Refund")).not.toBeInTheDocument();
    expect(screen.queryByText("Failure")).not.toBeInTheDocument();
    expect(screen.queryByText("Reason")).not.toBeInTheDocument();
  });
});

// A swap with an intermediate leg carries five trackers, and in one wrapping
// row they made the screen wide. The trackers and the other chains take the
// first row and the Zcash transactions the second.
describe("SwapDetailModal trackers", () => {
  it("puts the Zcash transactions on a row of their own", () => {
    render(
      <SwapDetailModal
        record={record({
          status: SwapStatusEnum.Completed,
          broadcast: {
            txId: "aa11".repeat(16),
            allTxIds: ["cc33".repeat(16), "aa11".repeat(16)],
          } as SwapRecordType["broadcast"],
          destinationTxHash: "SolanaDeliverySignaturePlaceholder",
        })}
        index={0}
        length={1}
        moveDetail={jest.fn()}
        modalIsOpen
        closeModal={jest.fn()}
        onRemove={jest.fn()}
      />,
      { contextOverrides: { currentWallet: { chain_name: "main" } as never } },
    );

    const rowOf = (name: RegExp) => screen.getByRole("button", { name }).parentElement;

    expect(rowOf(/SwapKit Explorer/)).toBe(rowOf(/Destination chain explorer/));
    expect(rowOf(/Source chain explorer/)).toBe(rowOf(/Source chain hop 1/));
    expect(rowOf(/Source chain explorer/)).not.toBe(rowOf(/SwapKit Explorer/));
  });
});
