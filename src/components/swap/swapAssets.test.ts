import { isZecWrapper, isQuotableToken, repeatedCoins, shortContract, ZEC_TOKEN_ENTRY } from "./swapAssets";
import type { TokenEntryType } from "../../swap";

const entry = (over: Partial<TokenEntryType>): TokenEntryType => ({
  chain: "SOL",
  chainId: "solana",
  ticker: "SOL",
  identifier: "SOL.SOL",
  symbol: "SOL",
  name: "Solana",
  decimals: 9,
  ...over,
});

describe("repeatedCoins", () => {
  it("repeats coins that share chain and ticker, whatever the casing", () => {
    const a = entry({ chain: "NEAR", ticker: "wBTC", identifier: "NEAR.wBTC-a" });
    const b = entry({ chain: "NEAR", ticker: "WBTC", identifier: "NEAR.WBTC-b" });
    expect(repeatedCoins([a, b])).toEqual(new Set(["NEAR.wBTC-a", "NEAR.WBTC-b"]));
  });

  it("does not repeat a coin whose other entries are on other chains", () => {
    const a = entry({ chain: "ETH", ticker: "ETH", identifier: "ETH.ETH" });
    const b = entry({ chain: "BASE", ticker: "ETH", identifier: "BASE.ETH" });
    expect(repeatedCoins([a, b]).size).toBe(0);
  });
});

describe("shortContract", () => {
  it("cuts a long contract in the middle and leaves a short one alone", () => {
    expect(shortContract("miden-0x419f8f4bff72959132aa7cea15a4c1.omft.near")).toBe("miden-0x419f…omft.near");
    expect(shortContract("eth.bridge.near")).toBe("eth.bridge.near");
  });
});

describe("isZecWrapper", () => {
  // The three the catalogue actually lists, verified against the live
  // /swapTo response for ZEC.ZEC on 2026-09-02.
  it.each([
    ["STRK", "starknet", "STRK.ZEC-0X05CE53B9B68FB8E9ECAB9283A96D97948914733FD6ED8D9A53A276A419497841"],
    ["SOL", "solana", "SOL.ZEC-A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS"],
    ["NEAR", "near", "NEAR.ZEC-zec.omft.near"],
  ])("recognises ZEC wrapped on %s", (chain, chainId, identifier) => {
    expect(isZecWrapper(entry({ chain, chainId, identifier, ticker: "ZEC", symbol: "ZEC" }))).toBe(true);
  });

  it("leaves every other asset alone", () => {
    expect(isZecWrapper(entry({ chain: "BTC", chainId: "bitcoin", identifier: "BTC.BTC", ticker: "BTC" }))).toBe(false);
    expect(isZecWrapper(entry({}))).toBe(false);
  });

  // Native ZEC is excluded from the catalogue upstream, so this never runs in
  // practice — but a predicate that called the fixed side a wrapper would be
  // saying something false about it.
  it("does not call native ZEC a wrapper", () => {
    expect(isZecWrapper(ZEC_TOKEN_ENTRY)).toBe(false);
  });

  // Tickers arrive from the API as written; nothing guarantees the case.
  it("matches whatever case the ticker arrives in", () => {
    expect(isZecWrapper(entry({ ticker: "zec", chainId: "solana" }))).toBe(true);
  });

  // A wrapper is still a perfectly quotable entry — it is hidden by direction,
  // not by being malformed, and the two filters must not be confused.
  it("is orthogonal to whether the entry can be quoted", () => {
    const wrapper = entry({ ticker: "ZEC", symbol: "ZEC", identifier: "SOL.ZEC-A7bd" });
    expect(isQuotableToken(wrapper)).toBe(true);
    expect(isZecWrapper(wrapper)).toBe(true);
  });
});
