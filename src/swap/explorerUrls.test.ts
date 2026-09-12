import { BlockExplorerEnum, ServerChainNameEnum } from "../components/appstate";
import { SwapDirectionEnum } from "./enums/SwapDirectionEnum";
import { SwapKitProviderEnum } from "./enums/SwapKitProviderEnum";
import { SwapStatusEnum } from "./enums/SwapStatusEnum";
import { buildChainExplorerUrl, buildTrackerEntries } from "./explorerUrls";
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
  destinationAddress: "7jAX2H5xwA3yD5hdestination",
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
  it("offers the destination chain explorer for a swap into Solana", () => {
    const entries = buildTrackerEntries({ record: record({ destinationTxHash: "5solanasignature" }), ...explorer });

    expect(entries).toContainEqual({
      key: "dest-explorer",
      label: "Destination chain explorer",
      url: "https://solscan.io/tx/5solanasignature",
    });
  });
});
