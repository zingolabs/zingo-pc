/**
 * @jest-environment node
 */

const { isOpenablePaymentUri, MAX_PAYMENT_URI_LENGTH } = require("../../public/paymentUri");
const { buildEip681Uri, buildMemolessPaymentUri } = require("../swap/chainMemoEncoding");

const EVM = "0x1111111111111111111111111111111111111111";

describe("isOpenablePaymentUri", () => {
  // Whatever the deposit QR builds has to be openable, or the button would
  // silently do nothing, as the one this replaces did.
  describe("accepts every link the deposit QR builds", () => {
    it.each([
      [
        "EVM with memo",
        buildEip681Uri({
          chain: "ETH",
          chainId: "1",
          decimals: 18,
          vaultAddress: EVM,
          amountHumanDecimal: "0.001",
          memoHexWithPrefix: "0x3d3a65",
        }),
      ],
      [
        "EVM native",
        buildMemolessPaymentUri({
          chain: "BASE",
          chainId: "8453",
          decimals: 18,
          address: EVM,
          amountHumanDecimal: "0.5",
          isNative: true,
        }),
      ],
      [
        "Bitcoin",
        buildMemolessPaymentUri({
          chain: "BTC",
          chainId: "bitcoin",
          decimals: 8,
          address: "bc1qexampleaddress0",
          amountHumanDecimal: "0.0012",
          isNative: true,
        }),
      ],
      [
        "Bitcoin Cash",
        buildMemolessPaymentUri({
          chain: "BCH",
          chainId: "bitcoincash",
          decimals: 8,
          address: "qpexampleaddress0",
          amountHumanDecimal: "1",
          isNative: true,
        }),
      ],
      [
        "Solana",
        buildMemolessPaymentUri({
          chain: "SOL",
          chainId: "solana",
          decimals: 9,
          address: "So1anaAddressPLACEHo1der1111111111111111111",
          amountHumanDecimal: "0.1",
          isNative: true,
        }),
      ],
      [
        "TON",
        buildMemolessPaymentUri({
          chain: "TON",
          chainId: "ton",
          decimals: 9,
          address: "EQExampleTonAddress_placeholder-1",
          amountHumanDecimal: "2",
          isNative: true,
        }),
      ],
    ])("%s", (_name, uri) => {
      expect(uri).toBeTruthy();
      expect(isOpenablePaymentUri(uri)).toBe(true);
    });
  });

  it.each([
    ["an https link", "https://example.com"],
    ["a file link", "file:///etc/passwd"],
    ["a zcash link, which would open this app", "zcash:u1abc?amount=1"],
    ["an unknown scheme", "vbscript:msgbox(1)"],
    ["a link with a space", "bitcoin:bc1qabc?amount=1 --flag"],
    ["a link with a newline", "solana:So1ana?amount=1\nfoo"],
    ["an extra query parameter", `ethereum:${EVM}@1?value=1&gas=1`],
    ["a bare address", EVM],
    ["something that is not a string", 42],
  ])("refuses %s", (_name, uri) => {
    expect(isOpenablePaymentUri(uri)).toBe(false);
  });

  it("refuses a link longer than the limit", () => {
    const uri = `ethereum:${EVM}@1?value=1&data=0x${"ab".repeat(MAX_PAYMENT_URI_LENGTH)}`;
    expect(isOpenablePaymentUri(uri)).toBe(false);
  });
});
