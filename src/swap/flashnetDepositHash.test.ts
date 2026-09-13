import { fillFlashnetDepositHash, lacksFlashnetDepositHash } from "./flashnetDepositHash";
import { SwapDirectionEnum } from "./enums/SwapDirectionEnum";
import { SwapKitProviderEnum } from "./enums/SwapKitProviderEnum";
import { SwapStatusEnum } from "./enums/SwapStatusEnum";
import type { SwapRecordType } from "./types/SwapRecordType";

const SOURCE_HASH = "SourceSignaturePlaceholder".padEnd(88, "x");

const inboundFlashnet = (overrides: Partial<SwapRecordType> = {}): SwapRecordType => ({
  recordId: "rec-in",
  depositAddress: "SolanaDepositPlaceholder",
  provider: SwapKitProviderEnum.Flashnet,
  direction: SwapDirectionEnum.Inbound,
  routeId: "route",
  sellAsset: { swapKitId: "SOL.SOL", chain: "SOL", symbol: "SOL", ticker: "SOL", chainId: "solana", decimals: 9 },
  receiveAsset: { swapKitId: "ZEC.ZEC", chain: "ZEC", symbol: "ZEC", ticker: "ZEC", chainId: "zcash", decimals: 8 },
  sellAmountHumanDecimal: "0.1",
  expectedReceiveAmount: "0.008",
  minReceiveAmount: "0.0079",
  destinationAddress: "t1EphemeralPlaceholder",
  sourceAddress: "SolanaRefundPlaceholder",
  status: SwapStatusEnum.Completed,
  providerData: { kind: SwapKitProviderEnum.Flashnet },
  providerOrderId: "ord_00000000-aaaa-bbbb-cccc-000000000001",
  trackCaptureVersion: 3,
  fiatValueBasis: { sellUsdUnitPrice: 1, receiveUsdUnitPrice: 1, capturedAt: 0 },
  createdAtMs: 1,
  updatedAtMs: 1,
  ...overrides,
});

const explorer = (hash: string | null) => ({ getOrderSourceTxHash: jest.fn(async () => hash) });

describe("lacksFlashnetDepositHash", () => {
  it("is true for an inbound Flashnet swap with an order and no deposit hash", () => {
    expect(lacksFlashnetDepositHash(inboundFlashnet())).toBe(true);
  });

  it("is false once the deposit hash is known", () => {
    expect(lacksFlashnetDepositHash(inboundFlashnet({ observedDepositTxHash: SOURCE_HASH }))).toBe(false);
  });

  // An outbound deposit is this wallet's own broadcast.
  it("is false for an outbound swap", () => {
    expect(lacksFlashnetDepositHash(inboundFlashnet({ direction: SwapDirectionEnum.Outbound }))).toBe(false);
  });

  it("is false for another provider", () => {
    expect(lacksFlashnetDepositHash(inboundFlashnet({ provider: SwapKitProviderEnum.Near }))).toBe(false);
  });

  // No order yet means Flashnet has not seen the deposit, so there is nothing
  // to ask about.
  it("is false before Flashnet has taken an order", () => {
    expect(lacksFlashnetDepositHash(inboundFlashnet({ providerOrderId: undefined }))).toBe(false);
  });
});

describe("fillFlashnetDepositHash", () => {
  it("fills the deposit hash from the explorer and keeps the new capture version", async () => {
    const client = explorer(SOURCE_HASH);

    const filled = await fillFlashnetDepositHash(inboundFlashnet(), { previousVersion: 2, client });

    expect(filled.observedDepositTxHash).toBe(SOURCE_HASH);
    expect(filled.trackCaptureVersion).toBe(3);
    expect(client.getOrderSourceTxHash).toHaveBeenCalledWith("ord_00000000-aaaa-bbbb-cccc-000000000001");
  });

  // Still missing, the record keeps the version it had, so a finished swap is
  // asked about again when it is next shown rather than left without it.
  it("keeps the previous capture version when the explorer has no hash", async () => {
    const filled = await fillFlashnetDepositHash(inboundFlashnet(), { previousVersion: 2, client: explorer(null) });

    expect(filled.observedDepositTxHash).toBeUndefined();
    expect(filled.trackCaptureVersion).toBe(2);
  });

  it("never throws, and treats a failure like a miss", async () => {
    const client = {
      getOrderSourceTxHash: jest.fn(async () => {
        throw new Error("explorer unreachable");
      }),
    };

    const filled = await fillFlashnetDepositHash(inboundFlashnet(), { previousVersion: 2, client });

    expect(filled.observedDepositTxHash).toBeUndefined();
    expect(filled.trackCaptureVersion).toBe(2);
  });

  it("leaves a record that needs nothing untouched, without asking", async () => {
    const client = explorer(SOURCE_HASH);
    const outbound = inboundFlashnet({ direction: SwapDirectionEnum.Outbound });

    await expect(fillFlashnetDepositHash(outbound, { previousVersion: 2, client })).resolves.toBe(outbound);
    expect(client.getOrderSourceTxHash).not.toHaveBeenCalled();
  });
});
