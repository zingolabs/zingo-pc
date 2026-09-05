import { pickChainAsset } from "./pickChainAsset";
import type { TokenEntryType } from "../../swap";

const token = (identifier: string, chain: string): TokenEntryType => ({ identifier, chain }) as TokenEntryType;

describe("pickChainAsset", () => {
  // A SwapKit identifier names a token by appending its contract to the chain,
  // so the entry without a suffix is the chain's own asset. Taking the first
  // match instead lands on whichever ERC-20 the catalog happens to order
  // first, which is nobody's idea of the default for "swap to this contact".
  it("prefers the chain's native asset over a token listed before it", () => {
    const tokens = [token("ETH.USDC-0xa0b8", "ETH"), token("ETH.ETH", "ETH"), token("BTC.BTC", "BTC")];

    expect(pickChainAsset(tokens, "ETH")?.identifier).toBe("ETH.ETH");
  });

  // The catalog arrives from SwapKit unnormalised, and a contact's chain is
  // stored in whatever case it was written.
  it("matches the chain whatever the casing", () => {
    expect(pickChainAsset([token("BTC.BTC", "BTC")], "btc")?.identifier).toBe("BTC.BTC");
  });

  // A chain whose native asset the catalog does not carry still has something
  // worth pointing the chip at.
  it("falls back to the first asset on the chain", () => {
    const tokens = [token("ARB.USDC-0x1234", "ARB"), token("ARB.DAI-0x5678", "ARB")];

    expect(pickChainAsset(tokens, "ARB")?.identifier).toBe("ARB.USDC-0x1234");
  });

  // Nothing on that chain is not a swap that can be set up, and the caller
  // drops the handoff rather than leaving it pending forever.
  it("has nothing to offer for a chain the catalog does not carry", () => {
    expect(pickChainAsset([token("BTC.BTC", "BTC")], "DOGE")).toBeUndefined();
  });
});
