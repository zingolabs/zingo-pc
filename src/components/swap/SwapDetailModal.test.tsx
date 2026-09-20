import React from "react";
import { fireEvent, screen, within } from "@testing-library/react";
import { render } from "../../test-utils";
import SwapDetailModal from "./SwapDetailModal";
import { SwapDirectionEnum, SwapKitProviderEnum, SwapStatusEnum } from "../../swap";
import type { SwapAssetType, SwapRecordType } from "../../swap";

jest.mock("../../electronBridge");

// Null unless a test sets it: the view reads the service off mainnet as null,
// which is what every other test here wants.
let mockSwapService: unknown = null;
jest.mock("../../context/ContextSwapService", () => ({
  useSwapService: () => mockSwapService,
}));

afterEach(() => {
  mockSwapService = null;
});

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

/** Opens the technical half, which a plain view keeps folded away. */
const openAdvanced = () => fireEvent.click(screen.getByRole("button", { name: /advanced/i }));

/**
 * A swap that ended badly has to say so on the screen the user opens to find
 * out why. The reason is the provider's to give and often missing — SwapKit
 * omits `refundReason` when the provider gave none, which is what a Flashnet
 * refund did on mainnet on 2026-09-12 — so the status, not
 * the text, is what decides that there is an ending to report.
 */
// The tolerance a swap ran under once decided a refund investigation and was
// recorded nowhere, so it could only be guessed.
// A finished swap is no longer polled, so the view asks about it once when
// it is shown. The arrows step to another swap without remounting the view,
// which is why asking on opening alone would miss every swap but the first.
describe("SwapDetailModal backfill", () => {
  it("asks about the swap it shows, and about each one the arrows step to", () => {
    const backfillFinishedRecord = jest.fn(async () => undefined);
    mockSwapService = { backfillFinishedRecord };

    const view = (recordId: string) => (
      <SwapDetailModal
        record={record({ recordId })}
        index={0}
        length={2}
        moveDetail={jest.fn()}
        modalIsOpen
        closeModal={jest.fn()}
        onRemove={jest.fn()}
      />
    );
    const { rerender } = render(view("rec-1"));
    rerender(view("rec-2"));

    expect(backfillFinishedRecord.mock.calls).toEqual([["rec-1"], ["rec-2"]]);
  });

  it("does not ask again while the same swap stays shown", () => {
    const backfillFinishedRecord = jest.fn(async () => undefined);
    mockSwapService = { backfillFinishedRecord };

    const view = (updatedAtMs: number) => (
      <SwapDetailModal
        record={record({ recordId: "rec-1", updatedAtMs })}
        index={0}
        length={1}
        moveDetail={jest.fn()}
        modalIsOpen
        closeModal={jest.fn()}
        onRemove={jest.fn()}
      />
    );
    // A store update re-renders the view with a new record object for the
    // same swap, as the backfill itself does when it lands.
    const { rerender } = render(view(1));
    rerender(view(2));

    expect(backfillFinishedRecord).toHaveBeenCalledTimes(1);
  });
});

describe("SwapDetailModal provider", () => {
  // Beside the name, the logo repeats it, so it is not read out a second time.
  it("puts the provider logo beside its name", () => {
    renderDetail();

    expect(screen.getByText("Flashnet")).toBeInTheDocument();
    expect(screen.getByTestId("provider-icon")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("SwapDetailModal slippage", () => {
  it("shows the tolerance and what the swap came to", () => {
    renderDetail({
      status: SwapStatusEnum.Completed,
      requestedSlippageBps: 100,
      slippageToleranceBps: 100,
      realizedSlippageBps: -6,
    });

    openAdvanced();

    expect(screen.getByText("Slippage tolerance")).toBeInTheDocument();
    expect(screen.getByText("1%")).toBeInTheDocument();
    expect(screen.getByText("Received 0.06% more than expected")).toBeInTheDocument();
  });

  it("shows both tolerances when the provider applied another", () => {
    renderDetail({ requestedSlippageBps: 100, slippageToleranceBps: 200 });

    openAdvanced();

    expect(screen.getByText("2% (1% requested)")).toBeInTheDocument();
  });

  it("shows nothing for a record made before either was kept", () => {
    renderDetail();

    openAdvanced();

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

// The link a wallet user wants is the transaction this wallet made; the rest
// describe the route the provider took, and are one press away under Advanced.
describe("SwapDetailModal trackers", () => {
  const withLegs = () => (
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
    />
  );

  it("keeps the links out of the plain view", () => {
    render(withLegs(), { contextOverrides: { currentWallet: { chain_name: "main" } as never } });

    expect(screen.queryByRole("button", { name: /View transaction/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /SwapKit Explorer/ })).not.toBeInTheDocument();
  });

  // A link belongs on the transaction it opens: matching a button named after a
  // leg to a hash listed elsewhere is work the screen can do for the reader.
  it("gives each transaction its own link", () => {
    render(withLegs(), { contextOverrides: { currentWallet: { chain_name: "main" } as never } });

    openAdvanced();

    // The deposit, the hop that fed it and the delivery on Solana.
    expect(screen.getAllByRole("button", { name: /View transaction/ })).toHaveLength(3);
  });

  it("keeps the swap’s own trackers, which belong to no one transaction", () => {
    render(withLegs(), { contextOverrides: { currentWallet: { chain_name: "main" } as never } });

    openAdvanced();

    const trackers = within(screen.getByRole("group", { name: "Trackers" }));
    expect(trackers.getByRole("button", { name: /SwapKit Explorer/ })).toBeInTheDocument();
    // Named after a leg rather than after the swap: replaced by the links on
    // the transaction rows themselves.
    expect(trackers.queryByRole("button", { name: /chain explorer/ })).not.toBeInTheDocument();
  });
});

describe("SwapDetailModal advanced half", () => {
  // A swap that went through leaves a page of ids, addresses and hashes. The
  // person who made it came to see that it went through.
  it("opens on the swap itself, with the record of how it ran folded away", () => {
    renderDetail({ status: SwapStatusEnum.Completed, routeId: "route-1", providerOrderId: "order-9" });

    expect(screen.getByText("Provider")).toBeInTheDocument();
    expect(screen.queryByText("Route id")).not.toBeInTheDocument();
    expect(screen.queryByText("Order id")).not.toBeInTheDocument();
    expect(screen.queryByText("Deposit address")).not.toBeInTheDocument();
  });

  it("hands the whole record over on one press", () => {
    renderDetail({ status: SwapStatusEnum.Completed, routeId: "route-1", providerOrderId: "order-9" });

    openAdvanced();

    expect(screen.getByText("route-1")).toBeInTheDocument();
    expect(screen.getByText("order-9")).toBeInTheDocument();
  });
});

describe("SwapDetailModal refund", () => {
  // What became of the money was spread over three places: the reason here, the
  // hash among the transactions under Advanced, the link among the trackers.
  const refunded = () =>
    renderDetail({
      status: SwapStatusEnum.Refunded,
      refundInfo: { refundReason: "the provider could not deliver", refundTxHash: "dd44".repeat(16) },
    } as Partial<SwapRecordType>);

  it("reports the reason, the transaction and the way to it together", () => {
    refunded();

    expect(screen.getByText("the provider could not deliver")).toBeInTheDocument();
    expect(screen.getByText("Refund transaction")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /View refund/ })).toBeInTheDocument();
  });

  it("does not list the refund again under Advanced", () => {
    refunded();

    openAdvanced();

    // Once on the screen, under the Refund heading, not again among the hashes.
    expect(screen.getAllByText("dd44".repeat(16))).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Refund explorer/ })).not.toBeInTheDocument();
  });
});
