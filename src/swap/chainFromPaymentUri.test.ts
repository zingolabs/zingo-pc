import { addressFromPaymentUri, chainFromPaymentUri } from "./chainFromPaymentUri";

const EVM = "0x1111111111111111111111111111111111111111";

describe("chainFromPaymentUri", () => {
  it("names the chain a scheme stands for", () => {
    expect(chainFromPaymentUri("bitcoin:bc1qexample?amount=0.1")).toBe("BTC");
    expect(chainFromPaymentUri("litecoin:ltc1qexample")).toBe("LTC");
    expect(chainFromPaymentUri("solana:So1ana?amount=1")).toBe("SOL");
    expect(chainFromPaymentUri("ton://transfer/EQabc?amount=1")).toBe("TON");
    expect(chainFromPaymentUri("zcash:u1abc?amount=1")).toBe("ZEC");
  });

  // Every EVM chain shares one address format; the chain id settles it.
  it("reads the EVM chain from an EIP-681 chain id", () => {
    expect(chainFromPaymentUri(`ethereum:${EVM}@8453?value=1`)).toBe("BASE");
    expect(chainFromPaymentUri(`ethereum:${EVM}@42161`)).toBe("ARB");
    expect(chainFromPaymentUri(`ethereum:pay-${EVM}@56/transfer?address=0x2`)).toBe("BSC");
  });

  it("takes an EIP-681 link without a chain id as Ethereum mainnet", () => {
    expect(chainFromPaymentUri(`ethereum:${EVM}?value=1`)).toBe("ETH");
  });

  it("names nothing for a bare address, an unknown scheme or an unknown chain id", () => {
    expect(chainFromPaymentUri(EVM)).toBeUndefined();
    expect(chainFromPaymentUri("bc1qexample")).toBeUndefined();
    expect(chainFromPaymentUri("https://example.com")).toBeUndefined();
    expect(chainFromPaymentUri(`ethereum:${EVM}@999999`)).toBeUndefined();
  });
});

describe("addressFromPaymentUri", () => {
  const EVM = "0x52908400098527886E0F7030069857D2E4169EE7";

  it("takes the bare address when the URI names the field's chain", () => {
    expect(addressFromPaymentUri("BTC", "bitcoin:bc1qexample?amount=0.1")).toBe("bc1qexample");
    expect(addressFromPaymentUri("SOL", " solana:So1ana?amount=1 ")).toBe("So1ana");
    expect(addressFromPaymentUri("TON", "ton://transfer/EQabc?amount=1")).toBe("EQabc");
    expect(addressFromPaymentUri("BASE", `ethereum:pay-${EVM}@8453`)).toBe(EVM);
  });

  it("takes the recipient of a token transfer, not the token contract", () => {
    const token = "0x2222222222222222222222222222222222222222";
    expect(addressFromPaymentUri("ETH", `ethereum:${token}/transfer?address=${EVM}&uint256=1`)).toBe(EVM);
    expect(addressFromPaymentUri("ETH", `ethereum:${token}/transfer`)).toBe(`ethereum:${token}/transfer`);
  });

  it("fits an ethereum URI without a chain id to any EVM field", () => {
    expect(addressFromPaymentUri("BASE", `ethereum:${EVM}`)).toBe(EVM);
    expect(addressFromPaymentUri("BSC", `ethereum:${EVM}?value=1e18`)).toBe(EVM);
    expect(addressFromPaymentUri("BTC", `ethereum:${EVM}`)).toBe(`ethereum:${EVM}`);
  });

  // `bitcoin:1…` unwrapped is a valid BCH address, and `ethereum:…@56` a valid
  // Ethereum one: the URI is left whole so the field refuses it.
  it("leaves a URI for another chain as it is", () => {
    expect(addressFromPaymentUri("ETH", `ethereum:${EVM}@56`)).toBe(`ethereum:${EVM}@56`);
    expect(addressFromPaymentUri("BCH", "bitcoin:1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa")).toBe(
      "bitcoin:1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
    );
    expect(addressFromPaymentUri("LTC", "bitcoin:3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy")).toBe(
      "bitcoin:3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy",
    );
  });

  it("only trims a plain address", () => {
    expect(addressFromPaymentUri("BTC", "  bc1qexample ")).toBe("bc1qexample");
  });
});
