import { swapRecordToValueTransfer, isOutboundSwap } from "./swapRecordToValueTransfer";
import { BroadcastStatusEnum } from "./enums/BroadcastStatusEnum";
import { SwapDirectionEnum } from "./enums/SwapDirectionEnum";
import { SwapKitProviderEnum } from "./enums/SwapKitProviderEnum";
import { SwapStatusEnum } from "./enums/SwapStatusEnum";
import { ValueTransferKindEnum } from "../components/appstate/enums/ValueTransferKindEnum";
import { ValueTransferStatusEnum } from "../components/appstate/enums/ValueTransferStatusEnum";
import type { SwapAssetType } from "./types/SwapAssetType";
import type { SwapRecordType } from "./types/SwapRecordType";

/**
 * The projection that lets a swap sit in the History list beside zingolib's
 * own transfers. It decides the number on the row, which direction the row
 * reads as, and whether the row is painted as settled or failed.
 */

const ZEC: SwapAssetType = {
  swapKitId: "ZEC.ZEC",
  chain: "ZEC",
  symbol: "ZEC",
  ticker: "ZEC",
  chainId: "zcash",
  decimals: 8,
};

const BTC: SwapAssetType = {
  swapKitId: "BTC.BTC",
  chain: "BTC",
  symbol: "BTC",
  ticker: "BTC",
  chainId: "bitcoin",
  decimals: 8,
};

const outbound = (overrides: Partial<SwapRecordType> = {}): SwapRecordType => ({
  recordId: "rec-1",
  depositAddress: "maya1vault",
  provider: SwapKitProviderEnum.MayachainStreaming,
  direction: SwapDirectionEnum.Outbound,
  routeId: "route-1",
  sellAsset: ZEC,
  receiveAsset: BTC,
  sellAmountHumanDecimal: "1.5",
  expectedReceiveAmount: "0.002",
  minReceiveAmount: "0.0019",
  destinationAddress: "bc1qdestination",
  sourceAddress: "t1ephemeral",
  status: SwapStatusEnum.Pending,
  providerData: { kind: SwapKitProviderEnum.MayachainStreaming, vaultAddress: "maya1vault", memo: "=:b:bc1q" },
  fiatValueBasis: { sellUsdUnitPrice: 30, receiveUsdUnitPrice: 60000, capturedAt: 0 },
  createdAtMs: 1_700_000_000_000,
  updatedAtMs: 1_700_000_000_000,
  ...overrides,
});

const inbound = (overrides: Partial<SwapRecordType> = {}): SwapRecordType =>
  outbound({
    direction: SwapDirectionEnum.Inbound,
    sellAsset: BTC,
    receiveAsset: ZEC,
    destinationAddress: "t1ephemeral",
    sourceAddress: "bc1qrefund",
    ...overrides,
  });

describe("the amount on the row", () => {
  // Rows read as money leaving or arriving, so each direction shows the ZEC
  // side: what left for outbound, what arrived for inbound.
  it("shows what left the wallet on an outbound swap", () => {
    expect(swapRecordToValueTransfer(outbound()).amount).toBe(1.5);
  });

  it("shows what arrived on an inbound swap", () => {
    expect(swapRecordToValueTransfer(inbound()).amount).toBe(0.002);
  });

  // Once the provider reports what it really paid out, that beats the
  // quote-time estimate the row started with.
  it("prefers the realised amount over the estimate once inbound settles", () => {
    expect(swapRecordToValueTransfer(inbound({ actualReceiveAmount: "0.0031" })).amount).toBe(0.0031);
  });

  it("keeps the outbound row on the amount sent, whatever the payout turns out to be", () => {
    expect(swapRecordToValueTransfer(outbound({ actualReceiveAmount: "0.0031" })).amount).toBe(1.5);
  });

  it("falls back to zero rather than NaN when an amount is unreadable", () => {
    expect(swapRecordToValueTransfer(outbound({ sellAmountHumanDecimal: "" })).amount).toBe(0);
  });
});

describe("the identifier the list keys on", () => {
  it("uses the broadcast txid once this wallet has paid", () => {
    const vt = swapRecordToValueTransfer(
      outbound({ broadcast: { status: BroadcastStatusEnum.Broadcasted, txId: "a".repeat(64) } }),
    );

    expect(vt.txid).toBe("a".repeat(64));
  });

  it("uses the observed hash when the deposit came from elsewhere", () => {
    expect(swapRecordToValueTransfer(inbound({ observedDepositTxHash: "b".repeat(64) })).txid).toBe("b".repeat(64));
  });

  // Before any deposit exists there is no transaction to name, so the row
  // borrows the deposit address. It cannot collide with a real txid: those are
  // 64 hex characters and a deposit address is not.
  it("falls back to the deposit address before a deposit exists", () => {
    expect(swapRecordToValueTransfer(outbound()).txid).toBe("maya1vault");
  });
});

describe("how the row is painted", () => {
  it("marks the kind so History routes the row to the swap detail", () => {
    const vt = swapRecordToValueTransfer(outbound());

    expect(vt.type).toBe(ValueTransferKindEnum.swap);
    expect(vt.swapRecordId).toBe("rec-1");
    expect(vt.swapStatus).toBe(SwapStatusEnum.Pending);
  });

  it.each([
    [SwapStatusEnum.Completed, ValueTransferStatusEnum.confirmed],
    [SwapStatusEnum.Failed, ValueTransferStatusEnum.failed],
    [SwapStatusEnum.Refunded, ValueTransferStatusEnum.failed],
    [SwapStatusEnum.Expired, ValueTransferStatusEnum.failed],
    [SwapStatusEnum.PendingDeposit, ValueTransferStatusEnum.calculated],
    [SwapStatusEnum.AwaitingExternalDeposit, ValueTransferStatusEnum.calculated],
    [SwapStatusEnum.Processing, ValueTransferStatusEnum.mempool],
  ])("paints %s as %s", (swapStatus, expected) => {
    expect(swapRecordToValueTransfer(outbound({ status: swapStatus })).status).toBe(expected);
  });

  // The provider is holding the funds and will refund or accept a top-up, so
  // painting the row as failed would tell the user they lost money they have
  // not lost.
  it("keeps an incomplete deposit in flight rather than failed", () => {
    expect(swapRecordToValueTransfer(outbound({ status: SwapStatusEnum.IncompleteDeposit })).status).toBe(
      ValueTransferStatusEnum.mempool,
    );
  });

  // The list short-circuits on zero confirmations to render progress, so a
  // swap still moving has to report zero.
  it("reports confirmations only once the swap has settled", () => {
    expect(swapRecordToValueTransfer(outbound({ status: SwapStatusEnum.Processing })).confirmations).toBe(0);
    expect(swapRecordToValueTransfer(outbound({ status: SwapStatusEnum.Completed })).confirmations).toBe(1);
  });

  it("times the row from when the swap was created, in seconds", () => {
    expect(swapRecordToValueTransfer(outbound()).time).toBe(1_700_000_000);
  });
});

describe("isOutboundSwap", () => {
  it("separates the directional buckets the history filter uses", () => {
    expect(isOutboundSwap(outbound())).toBe(true);
    expect(isOutboundSwap(inbound())).toBe(false);
  });
});
