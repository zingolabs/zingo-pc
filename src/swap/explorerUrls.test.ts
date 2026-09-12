import { BlockExplorerEnum, ServerChainNameEnum } from "../components/appstate";
import { SwapDirectionEnum } from "./enums/SwapDirectionEnum";
import { SwapKitProviderEnum } from "./enums/SwapKitProviderEnum";
import { SwapStatusEnum } from "./enums/SwapStatusEnum";
import { buildChainExplorerUrl, buildTrackerEntries } from "./explorerUrls";
import { hashRowsForRecord } from "./hashRowsForRecord";
import { applyDefaultTrackUpdate } from "./providers/trackUpdateBase";
import {
  DEPOSIT_HASH,
  NEAR_EXECUTION_HASH,
  SOLANA_DELIVERY_SIGNATURE,
  nearZecToSolUsdcTrack,
} from "./providers/fixtures/nearZecToSolUsdcTrack";
import type { SwapAssetType } from "./types/SwapAssetType";
import type { SwapRecordType } from "./types/SwapRecordType";

jest.mock("../electronBridge");

const explorer = {
  zecChainName: ServerChainNameEnum.mainChainName,
  zecBlockExplorer: BlockExplorerEnum.Zcashexplorer,
  zecBlockExplorerCustom: "",
};

const ZEC: SwapAssetType = {
  swapKitId: "ZEC.ZEC",
  chain: "ZEC",
  symbol: "ZEC",
  ticker: "ZEC",
  chainId: "zcash",
  decimals: 8,
};

const SOL_USDC: SwapAssetType = {
  swapKitId: "SOL.USDC-EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  chain: "SOL",
  symbol: "USDC",
  ticker: "USDC",
  chainId: "solana",
  decimals: 6,
};

const record = (overrides: Partial<SwapRecordType> = {}): SwapRecordType => ({
  recordId: "rec-1",
  depositAddress: "t1deposit",
  provider: SwapKitProviderEnum.Near,
  direction: SwapDirectionEnum.Outbound,
  routeId: "route-1",
  sellAsset: ZEC,
  receiveAsset: SOL_USDC,
  sellAmountHumanDecimal: "0.05",
  expectedReceiveAmount: "55.6",
  minReceiveAmount: "55.0",
  destinationAddress: "SolanaDestinationPlaceholder",
  sourceAddress: "t1ephemeral",
  status: SwapStatusEnum.Completed,
  providerData: { kind: SwapKitProviderEnum.Near, depositAddress: "t1deposit" },
  fiatValueBasis: { sellUsdUnitPrice: 1122, receiveUsdUnitPrice: 1, capturedAt: 0 },
  createdAtMs: 1_700_000_000_000,
  updatedAtMs: 1_700_000_000_000,
  ...overrides,
});

describe("buildChainExplorerUrl", () => {
  // A chain missing from the table does not fail loudly: the row is simply
  // left out. A NEAR swap into USDC on Solana showed no destination link at
  // all, because Solana was never in the table.
  it("links a Solana transaction", () => {
    expect(buildChainExplorerUrl({ chain: "SOL", hash: "5sig", ...explorer })).toBe("https://solscan.io/tx/5sig");
  });

  it("reads the chain symbol case-insensitively", () => {
    expect(buildChainExplorerUrl({ chain: "sol", hash: "5sig", ...explorer })).toBe("https://solscan.io/tx/5sig");
  });

  it("gives nothing for a chain it does not know", () => {
    expect(buildChainExplorerUrl({ chain: "NOPE", hash: "h", ...explorer })).toBeNull();
  });
});

describe("buildTrackerEntries", () => {
  // The real response, end to end: what the poller stores from it and what
  // the detail screen then links. NEAR Intents routes through a call on
  // NEAR that was captured nowhere, so neither the NEAR link nor, with
  // Solana missing from the table, the destination link ever appeared.
  it("links every leg of a NEAR Intents swap into Solana", () => {
    const tracked = applyDefaultTrackUpdate(record({ status: SwapStatusEnum.Processing }), nearZecToSolUsdcTrack);

    const entries = buildTrackerEntries({ record: tracked, ...explorer });

    expect(entries.map((e) => e.url)).toEqual(
      expect.arrayContaining([
        `https://nearblocks.io/txns/${NEAR_EXECUTION_HASH}`,
        `https://solscan.io/tx/${SOLANA_DELIVERY_SIGNATURE}`,
      ]),
    );
    expect(entries.find((e) => e.url.includes("nearblocks"))?.label).toBe("NEAR explorer");
  });

  it("lists each leg once, under the name of what it is", () => {
    const tracked = applyDefaultTrackUpdate(record({ status: SwapStatusEnum.Processing }), nearZecToSolUsdcTrack);

    expect(hashRowsForRecord(tracked)).toEqual([
      { label: "Deposit", value: DEPOSIT_HASH },
      { label: "Via NEAR", value: NEAR_EXECUTION_HASH },
      { label: "Destination", value: SOLANA_DELIVERY_SIGNATURE },
    ]);
  });

  // A leg that has not landed carries a placeholder hash, and a link to it
  // would open nothing.
  it("skips a leg that has not landed yet", () => {
    const inFlight = {
      ...nearZecToSolUsdcTrack,
      legs: nearZecToSolUsdcTrack.legs?.map((leg) =>
        leg.chainId === "near" ? { ...leg, hash: "0x" + "0".repeat(64) } : leg,
      ),
    };
    const tracked = applyDefaultTrackUpdate(record({ status: SwapStatusEnum.Processing }), inFlight);

    expect(tracked.intermediateLegs).toBeUndefined();
  });

  it("offers the destination chain explorer for a swap into Solana", () => {
    const entries = buildTrackerEntries({ record: record({ destinationTxHash: "5solanasignature" }), ...explorer });

    expect(entries).toContainEqual({
      key: "dest-explorer",
      label: "Destination chain explorer",
      url: "https://solscan.io/tx/5solanasignature",
    });
  });
});
