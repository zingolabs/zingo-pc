import { BlockExplorerEnum, ServerChainNameEnum } from "../components/appstate";
import Utils from "../utils/utils";
import { SwapKitProviderEnum } from "./enums/SwapKitProviderEnum";
import { isRealLegHash } from "./providers/trackUpdateBase";
import { providerLongLabel } from "./providerLabels";
import type { SwapRecordType } from "./types/SwapRecordType";

/**
 * Per-chain block-explorer transaction URLs, keyed by SwapKit's short chain
 * symbol, the same key `chainMemoEncoding` uses.
 *
 * The list covers the chains we have actually swapped through. Adding one is
 * a line. It stays static rather than reading SwapKit's catalog because the
 * catalog surfaces no explorer field, and these URLs change rarely.
 */
const CHAIN_EXPLORER_TX_URL: Record<string, (hash: string) => string> = {
  ETH: (h) => `https://etherscan.io/tx/${h}`,
  AVAX: (h) => `https://snowtrace.io/tx/${h}`,
  BSC: (h) => `https://bscscan.com/tx/${h}`,
  BASE: (h) => `https://basescan.org/tx/${h}`,
  ARB: (h) => `https://arbiscan.io/tx/${h}`,
  OP: (h) => `https://optimistic.etherscan.io/tx/${h}`,
  MATIC: (h) => `https://polygonscan.com/tx/${h}`,
  POL: (h) => `https://polygonscan.com/tx/${h}`,
  FTM: (h) => `https://ftmscan.com/tx/${h}`,
  GNOSIS: (h) => `https://gnosisscan.io/tx/${h}`,
  LINEA: (h) => `https://lineascan.build/tx/${h}`,
  BTC: (h) => `https://mempool.space/tx/${h}`,
  BCH: (h) => `https://blockchair.com/bitcoin-cash/transaction/${h}`,
  LTC: (h) => `https://blockchair.com/litecoin/transaction/${h}`,
  DOGE: (h) => `https://blockchair.com/dogecoin/transaction/${h}`,
  DASH: (h) => `https://blockchair.com/dash/transaction/${h}`,
  NEAR: (h) => `https://nearblocks.io/txns/${h}`,
  MAYA: (h) => `https://www.mayascan.org/tx/${h}`,
  THOR: (h) => `https://viewblock.io/thorchain/tx/${h}`,
};

/**
 * A block-explorer URL for a chain and hash. ZEC goes through the user's
 * configured explorer so this agrees with the History link, and every other
 * chain takes its default above.
 */
export function buildChainExplorerUrl(args: {
  chain: string;
  hash: string;
  zecChainName: ServerChainNameEnum | undefined;
  zecBlockExplorer: BlockExplorerEnum;
  zecBlockExplorerCustom: string;
}): string | null {
  const upper = args.chain.toUpperCase();
  if (upper === "ZEC") {
    const url = Utils.zecExplorerTxUrl(
      args.hash,
      args.zecChainName,
      args.zecBlockExplorer,
      args.zecBlockExplorerCustom,
    );
    return url.length > 0 ? url : null;
  }
  const builder = CHAIN_EXPLORER_TX_URL[upper];
  return builder ? builder(args.hash) : null;
}

/**
 * The provider's own lookup endpoint, which usually carries more than a block
 * explorer does: parsed memos, refund state, streaming-step counters. Null
 * when the provider publishes none, or keys on something other than a tx hash.
 */
export function buildProviderExplorerUrl(provider: SwapKitProviderEnum, hash: string): string | null {
  switch (provider) {
    case SwapKitProviderEnum.MayachainStreaming:
    case SwapKitProviderEnum.Mayachain:
      return `https://mayanode.mayachain.info/mayachain/tx/details/${hash}`;
    case SwapKitProviderEnum.ThorchainStreaming:
    case SwapKitProviderEnum.Thorchain:
      return `https://thornode.ninerealms.com/thorchain/tx/details/${hash}`;
    default:
      return null;
  }
}

/**
 * SwapKit's public explorer only renders a usable timeline for
 * `?hash=…&chainId=…`. A `depositAddress` query answers 200 from the API but
 * leaves the dashboard blank, so a hash-less record gets no URL at all and
 * the provider-native row carries the user instead.
 */
export function buildSwapKitTrackerUrl(record: SwapRecordType): string | null {
  const hash = record.broadcast?.txId ?? record.observedDepositTxHash;
  if (!hash) return null;
  return `https://track.swapkit.dev/?hash=${encodeURIComponent(hash)}&chainId=${encodeURIComponent(record.sellAsset.chainId)}`;
}

export type TrackerEntryType = {
  key: string;
  label: string;
  url: string;
};

/**
 * The tracker URLs a record can offer, ordered by how much they help:
 * SwapKit's normalised cross-provider view, then the provider's own
 * deep-link, then the per-transaction block explorers. An entry that cannot
 * be built, for a missing hash or an unknown chain, is left out, so every row
 * rendered from this opens something.
 */
export function buildTrackerEntries(args: {
  record: SwapRecordType;
  zecChainName: ServerChainNameEnum | undefined;
  zecBlockExplorer: BlockExplorerEnum;
  zecBlockExplorerCustom: string;
}): TrackerEntryType[] {
  const { record, zecChainName, zecBlockExplorer, zecBlockExplorerCustom } = args;
  const explorerArgs = { zecChainName, zecBlockExplorer, zecBlockExplorerCustom };
  const entries: TrackerEntryType[] = [];

  const swapKitUrl = buildSwapKitTrackerUrl(record);
  if (swapKitUrl) {
    entries.push({ key: "swapkit", label: "SwapKit Explorer", url: swapKitUrl });
  }

  // Prefer the URL the provider itself sent through `/track`: Flashnet's
  // points straight at the order id, which reaches further than any
  // hash-keyed URL could. `isRealLegHash` filters the all-zero placeholder an
  // older build may have persisted, so no dead link is ever built from it.
  const broadcastHash = isRealLegHash(record.broadcast?.txId) ? record.broadcast?.txId : undefined;
  const observedHash = isRealLegHash(record.observedDepositTxHash) ? record.observedDepositTxHash : undefined;
  const sourceHash = broadcastHash ?? observedHash ?? null;
  const providerUrl =
    record.providerExplorerUrl ?? (sourceHash ? buildProviderExplorerUrl(record.provider, sourceHash) : null);
  if (providerUrl) {
    entries.push({ key: "provider", label: providerLongLabel(record.provider), url: providerUrl });
  }

  if (sourceHash) {
    const url = buildChainExplorerUrl({ chain: record.sellAsset.chain, hash: sourceHash, ...explorerArgs });
    if (url) entries.push({ key: "source-explorer", label: "Source chain explorer", url });
  }

  // The intermediate hops of an outbound ZIP-320 pair. The last is the hash
  // already surfaced above, so it is skipped.
  if (record.broadcast?.allTxIds && record.broadcast.allTxIds.length > 1) {
    record.broadcast.allTxIds.slice(0, -1).forEach((hop, index) => {
      if (!isRealLegHash(hop)) return;
      const url = buildChainExplorerUrl({ chain: record.sellAsset.chain, hash: hop, ...explorerArgs });
      if (url) entries.push({ key: `source-hop-${index}`, label: `Source chain hop ${index + 1}`, url });
    });
  }

  if (isRealLegHash(record.destinationTxHash)) {
    const url = buildChainExplorerUrl({
      chain: record.receiveAsset.chain,
      hash: record.destinationTxHash as string,
      ...explorerArgs,
    });
    if (url) entries.push({ key: "dest-explorer", label: "Destination chain explorer", url });
  }

  return entries;
}
