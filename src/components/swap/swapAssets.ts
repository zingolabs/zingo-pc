import type { SwapAssetType, TokenEntryType } from "../../swap";

/**
 * ZEC as a catalog entry, so the fixed side of the swap goes through the same
 * `TokenLogo` as the asset the user picks and both sides get the same
 * composition treatment. The catalog itself excludes `ZEC.ZEC` — it lists what
 * ZEC can be swapped against — so this is written out rather than looked up.
 *
 * Same entry as the mobile wallet's `ZEC_TOKEN_ENTRY`, logo URL included.
 */
export const ZEC_TOKEN_ENTRY: TokenEntryType = {
  chain: "ZEC",
  chainId: "zcash",
  ticker: "ZEC",
  identifier: "ZEC.ZEC",
  symbol: "ZEC",
  name: "Zcash",
  decimals: 8,
  // No `logoURI`: the Zcash mark is bundled (see `chainIcons.ts`), so this chip
  // draws without a network round trip and without asking a third party for the
  // one logo in the picker that is ours to hold.
};

/** ZEC is the fixed side of every swap this wallet performs. */
export const ZEC_ASSET: SwapAssetType = {
  swapKitId: "ZEC.ZEC",
  chain: "ZEC",
  symbol: "ZEC",
  ticker: "ZEC",
  chainId: "zcash",
  decimals: 8,
};

/**
 * The asset the user picked, in the shape the service quotes against.
 *
 * Both name forms are kept because they answer different questions. `symbol`
 * is the catalog's precise variant, `BTC-nbtc.bridge.near` for NEAR's wrapped
 * BTC, which is what the user will actually end up holding. `ticker` is the
 * short form the picker showed them. A surface that means "the asset you
 * chose" wants the second; one that means "the asset you will hold" wants the
 * first, and collapsing them would make one of the two lie.
 */
/**
 * Whether a catalog entry carries what a quote needs.
 *
 * `TokenEntryType` declares these fields as present and the live catalog ships
 * entries without them. An entry missing any of them cannot be quoted, so it
 * is dropped at the door rather than reaching the picker and failing later as
 * a malformed request.
 */
export function isQuotableToken(token: TokenEntryType): boolean {
  return !!token.identifier && !!token.chain && !!token.symbol && !!token.chainId && Number.isFinite(token.decimals);
}

export function tokenToSwapAsset(token: TokenEntryType): SwapAssetType {
  return {
    swapKitId: token.identifier,
    chain: token.chain,
    symbol: token.symbol,
    ticker: token.ticker,
    chainId: token.chainId,
    decimals: token.decimals,
  };
}
