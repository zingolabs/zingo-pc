import Utils from "./utils";
import {
  BlockExplorerEnum,
  ServerChainNameEnum,
  UnifiedAddressClass,
  ValueTransferKindEnum,
  ValueTransferStatusEnum,
} from "../components/appstate";
import { shell } from "../electronBridge";

jest.mock("../electronBridge");

const mockOpenExternal = shell.openExternal as jest.Mock;

beforeEach(() => {
  mockOpenExternal.mockClear();
});

// ---------------------------------------------------------------------------
// trimToSmall
// ---------------------------------------------------------------------------
describe("trimToSmall", () => {
  it("returns empty string for undefined", () => {
    expect(Utils.trimToSmall(undefined)).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(Utils.trimToSmall("")).toBe("");
  });

  it("trims with default 5 chars on each side", () => {
    expect(Utils.trimToSmall("abcde12345")).toBe("abcde...12345");
  });

  it("trims with custom numChars", () => {
    expect(Utils.trimToSmall("abcdefghij", 3)).toBe("abc...hij");
  });
});

// ---------------------------------------------------------------------------
// isValidSaplingPrivateKey
// ---------------------------------------------------------------------------
describe("isValidSaplingPrivateKey", () => {
  it("returns false for a random string", () => {
    expect(Utils.isValidSaplingPrivateKey("notakey")).toBe(false);
  });

  it("returns false for wrong prefix", () => {
    expect(Utils.isValidSaplingPrivateKey("secret-extended-key-regtest" + "a".repeat(278))).toBe(false);
  });

  it("returns true for valid testnet key format", () => {
    expect(Utils.isValidSaplingPrivateKey("secret-extended-key-test" + "a".repeat(278))).toBe(true);
  });

  it("returns true for valid mainnet key format", () => {
    expect(Utils.isValidSaplingPrivateKey("secret-extended-key-main" + "a".repeat(278))).toBe(true);
  });

  it("returns false when key is too short", () => {
    expect(Utils.isValidSaplingPrivateKey("secret-extended-key-main" + "a".repeat(100))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isValidSaplingViewingKey
// ---------------------------------------------------------------------------
describe("isValidSaplingViewingKey", () => {
  it("returns false for a random string", () => {
    expect(Utils.isValidSaplingViewingKey("notakey")).toBe(false);
  });

  it("returns true for valid viewing key format", () => {
    expect(Utils.isValidSaplingViewingKey("zxviews" + "a".repeat(278))).toBe(true);
  });

  it("returns false when key is too short", () => {
    expect(Utils.isValidSaplingViewingKey("zxviews" + "a".repeat(10))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// maxPrecision
// ---------------------------------------------------------------------------
describe("maxPrecision", () => {
  it("returns '0' for falsy input", () => {
    expect(Utils.maxPrecision(0)).toBe("0");
  });

  it("pads to 8 decimal places", () => {
    expect(Utils.maxPrecision(1.5)).toBe("1.50000000");
  });

  it("rounds at the 8th decimal", () => {
    expect(Utils.maxPrecision(1.123456789)).toBe("1.12345679");
  });

  it("handles whole numbers", () => {
    expect(Utils.maxPrecision(1)).toBe("1.00000000");
  });
});

// ---------------------------------------------------------------------------
// maxPrecisionTrimmed
// ---------------------------------------------------------------------------
describe("maxPrecisionTrimmed", () => {
  it("returns '0' for 0", () => {
    expect(Utils.maxPrecisionTrimmed(0)).toBe("0");
  });

  it("removes trailing zeros after decimal", () => {
    expect(Utils.maxPrecisionTrimmed(1.5)).toBe("1.5");
  });

  it("removes the decimal point when all decimals are zero", () => {
    expect(Utils.maxPrecisionTrimmed(1)).toBe("1");
  });

  it("preserves significant decimal digits", () => {
    expect(Utils.maxPrecisionTrimmed(1.12345678)).toBe("1.12345678");
  });

  it("trims trailing zeros but keeps significant ones", () => {
    expect(Utils.maxPrecisionTrimmed(1.1)).toBe("1.1");
  });
});

// ---------------------------------------------------------------------------
// splitZecAmountIntoBigSmall
// ---------------------------------------------------------------------------
describe("splitZecAmountIntoBigSmall", () => {
  it("returns '0' bigPart and empty smallPart for zero", () => {
    expect(Utils.splitZecAmountIntoBigSmall(0)).toEqual({ bigPart: "0", smallPart: "" });
  });

  it("returns empty smallPart when all tail decimals are zeros", () => {
    expect(Utils.splitZecAmountIntoBigSmall(1.5)).toEqual({ bigPart: "1.5000", smallPart: "" });
  });

  it("splits a value with significant tail digits", () => {
    expect(Utils.splitZecAmountIntoBigSmall(1.12345678)).toEqual({ bigPart: "1.1234", smallPart: "5678" });
  });

  it("rounds correctly at the 8th decimal", () => {
    expect(Utils.splitZecAmountIntoBigSmall(1.123456789)).toEqual({ bigPart: "1.1234", smallPart: "5679" });
  });

  it("returns empty smallPart for a whole number", () => {
    const { bigPart, smallPart } = Utils.splitZecAmountIntoBigSmall(10);
    expect(bigPart).toBe("10.0000");
    expect(smallPart).toBe("");
  });
});

// ---------------------------------------------------------------------------
// getReceivers
// ---------------------------------------------------------------------------
describe("getReceivers", () => {
  it("returns all three receivers when all are true", () => {
    const addr = { has_orchard: true, has_sapling: true, has_transparent: true } as UnifiedAddressClass;
    expect(Utils.getReceivers(addr)).toEqual(["Orchard", "Sapling", "Transparent"]);
  });

  it("returns only Sapling", () => {
    const addr = { has_orchard: false, has_sapling: true, has_transparent: false } as UnifiedAddressClass;
    expect(Utils.getReceivers(addr)).toEqual(["Sapling"]);
  });

  it("returns empty array when none are set", () => {
    const addr = { has_orchard: false, has_sapling: false, has_transparent: false } as UnifiedAddressClass;
    expect(Utils.getReceivers(addr)).toEqual([]);
  });

  it("respects Orchard-only", () => {
    const addr = { has_orchard: true, has_sapling: false, has_transparent: false } as UnifiedAddressClass;
    expect(Utils.getReceivers(addr)).toEqual(["Orchard"]);
  });
});

// ---------------------------------------------------------------------------
// splitStringIntoChunks
// ---------------------------------------------------------------------------
describe("splitStringIntoChunks", () => {
  it("returns original string when numChunks > string length", () => {
    expect(Utils.splitStringIntoChunks("abc", 10)).toEqual(["abc"]);
  });

  it("returns original string when string is shorter than 16 chars", () => {
    expect(Utils.splitStringIntoChunks("short", 3)).toEqual(["short"]);
  });

  it("splits a long string into the requested number of chunks", () => {
    const s = "a".repeat(30);
    const chunks = Utils.splitStringIntoChunks(s, 3);
    expect(chunks).toHaveLength(3);
    expect(chunks.join("")).toBe(s);
  });

  it("last chunk absorbs the remainder", () => {
    const s = "a".repeat(31);
    const chunks = Utils.splitStringIntoChunks(s, 3);
    expect(chunks).toHaveLength(3);
    expect(chunks.join("").length).toBe(31);
  });
});

// ---------------------------------------------------------------------------
// getZecToUsdString
// ---------------------------------------------------------------------------
describe("getZecToUsdString", () => {
  it("returns 'USD --' when price is missing", () => {
    expect(Utils.getZecToUsdString(undefined, 1)).toBe("USD --");
  });

  it("returns 'USD --' when zecValue is missing", () => {
    expect(Utils.getZecToUsdString(50000, undefined)).toBe("USD --");
  });

  it("returns 'USD --' when both are missing", () => {
    expect(Utils.getZecToUsdString(undefined, undefined)).toBe("USD --");
  });

  it("returns 'USD < 0.01' for tiny amounts", () => {
    expect(Utils.getZecToUsdString(1, 0.001)).toBe("USD < 0.01");
  });

  it("formats a normal USD amount with 2 decimal places", () => {
    expect(Utils.getZecToUsdString(50000, 1)).toBe("USD 50000.00");
  });

  it("rounds to 2 decimal places", () => {
    expect(Utils.getZecToUsdString(3, 1)).toBe("USD 3.00");
  });

  it("handles fractional USD amounts", () => {
    expect(Utils.getZecToUsdString(0.5, 1)).toBe("USD 0.50");
  });
});

// ---------------------------------------------------------------------------
// utf16Split
// ---------------------------------------------------------------------------
describe("utf16Split", () => {
  it("returns a single chunk when the string fits", () => {
    expect(Utils.utf16Split("hello", 10)).toEqual(["hello"]);
  });

  it("splits ASCII at the chunksize boundary", () => {
    expect(Utils.utf16Split("abcdefgh", 4)).toEqual(["abcd", "efgh"]);
  });

  it("handles odd-length strings", () => {
    const result = Utils.utf16Split("abcde", 4);
    expect(result.join("")).toBe("abcde");
    expect(result[0]).toBe("abcd");
    expect(result[1]).toBe("e");
  });

  it("counts emoji as 4 bytes and splits correctly", () => {
    // 🦄 has length 2 in JS (surrogate pair) → utf16Split counts it as 4 bytes
    const result = Utils.utf16Split("🦄abc", 4);
    expect(result[0]).toBe("🦄");
    expect(result[1]).toBe("abc");
  });

  it("returns empty array for empty string", () => {
    expect(Utils.utf16Split("", 4)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// VTTypeWithConfirmations
// ---------------------------------------------------------------------------
describe("VTTypeWithConfirmations", () => {
  it("returns 'Send' for a failed sent transaction", () => {
    expect(Utils.VTTypeWithConfirmations(ValueTransferKindEnum.sent, ValueTransferStatusEnum.failed, 0)).toBe("Send");
  });

  it("returns 'Shield' for a failed shield transaction", () => {
    expect(Utils.VTTypeWithConfirmations(ValueTransferKindEnum.shield, ValueTransferStatusEnum.failed, 0)).toBe(
      "Shield",
    );
  });

  it("returns '...Sending...' for a pending sent", () => {
    expect(Utils.VTTypeWithConfirmations(ValueTransferKindEnum.sent, "", 0)).toBe("...Sending...");
  });

  it("returns 'Sent' for a confirmed sent", () => {
    expect(Utils.VTTypeWithConfirmations(ValueTransferKindEnum.sent, "", 3)).toBe("Sent");
  });

  it("returns '...Receiving...' for a pending received", () => {
    expect(Utils.VTTypeWithConfirmations(ValueTransferKindEnum.received, "", 0)).toBe("...Receiving...");
  });

  it("returns 'Received' for a confirmed received", () => {
    expect(Utils.VTTypeWithConfirmations(ValueTransferKindEnum.received, "", 1)).toBe("Received");
  });

  it("returns '...Sending to self...' for a pending memoToSelf", () => {
    expect(Utils.VTTypeWithConfirmations(ValueTransferKindEnum.memoToSelf, "", 0)).toBe("...Sending to self...");
  });

  it("returns 'Memo to self' for a confirmed memoToSelf", () => {
    expect(Utils.VTTypeWithConfirmations(ValueTransferKindEnum.memoToSelf, "", 1)).toBe("Memo to self");
  });

  it("returns '...Sending to self...' for a pending sendToSelf", () => {
    expect(Utils.VTTypeWithConfirmations(ValueTransferKindEnum.sendToSelf, "", 0)).toBe("...Sending to self...");
  });

  it("returns 'Send to self' for a confirmed sendToSelf", () => {
    expect(Utils.VTTypeWithConfirmations(ValueTransferKindEnum.sendToSelf, "", 2)).toBe("Send to self");
  });

  it("returns '...Shielding...' for a pending shield", () => {
    expect(Utils.VTTypeWithConfirmations(ValueTransferKindEnum.shield, "", 0)).toBe("...Shielding...");
  });

  it("returns 'Shield' for a confirmed shield", () => {
    expect(Utils.VTTypeWithConfirmations(ValueTransferKindEnum.shield, "", 5)).toBe("Shield");
  });

  it("returns '...Sending...' for a pending rejection", () => {
    expect(Utils.VTTypeWithConfirmations(ValueTransferKindEnum.rejection, "", 0)).toBe("...Sending...");
  });

  it("returns 'Rejection' for a confirmed rejection", () => {
    expect(Utils.VTTypeWithConfirmations(ValueTransferKindEnum.rejection, "", 1)).toBe("Rejection");
  });

  it("returns empty string for unknown type", () => {
    expect(Utils.VTTypeWithConfirmations("", "", 0)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// getDefaultDonationAmount / getDefaultDonationMemo
// ---------------------------------------------------------------------------
describe("getDefaultDonationAmount", () => {
  it("returns 0.1 for mainnet", () => {
    expect(Utils.getDefaultDonationAmount(false)).toBe(0.1);
  });

  it("returns 0.1 for testnet", () => {
    expect(Utils.getDefaultDonationAmount(true)).toBe(0.1);
  });
});

describe("getDefaultDonationMemo", () => {
  it("returns the expected support memo", () => {
    expect(Utils.getDefaultDonationMemo(false)).toBe("Thanks for supporting Zingo!");
  });
});

// ---------------------------------------------------------------------------
// openTxid
// ---------------------------------------------------------------------------
describe("openTxid", () => {
  const txid = "abc123txid";

  it("opens Zcashexplorer mainnet URL", () => {
    Utils.openTxid(txid, ServerChainNameEnum.mainChainName, BlockExplorerEnum.Zcashexplorer, "");
    expect(mockOpenExternal).toHaveBeenCalledWith(`https://mainnet.zcashexplorer.app/transactions/${txid}`);
  });

  it("opens Zcashexplorer testnet URL", () => {
    Utils.openTxid(txid, ServerChainNameEnum.testChainName, BlockExplorerEnum.Zcashexplorer, "");
    expect(mockOpenExternal).toHaveBeenCalledWith(`https://testnet.zcashexplorer.app/transactions/${txid}`);
  });

  it("opens Cipherscan mainnet URL", () => {
    Utils.openTxid(txid, ServerChainNameEnum.mainChainName, BlockExplorerEnum.Cipherscan, "");
    expect(mockOpenExternal).toHaveBeenCalledWith(`https://cipherscan.app/tx/${txid}`);
  });

  it("opens Cipherscan testnet URL", () => {
    Utils.openTxid(txid, ServerChainNameEnum.testChainName, BlockExplorerEnum.Cipherscan, "");
    expect(mockOpenExternal).toHaveBeenCalledWith(`https://testnet.cipherscan.app/tx/${txid}`);
  });

  it("opens Zypherscan mainnet URL", () => {
    Utils.openTxid(txid, ServerChainNameEnum.mainChainName, BlockExplorerEnum.Zypherscan, "");
    expect(mockOpenExternal).toHaveBeenCalledWith(`https://www.zypherscan.com/tx/${txid}`);
  });

  it("opens Zypherscan testnet URL", () => {
    Utils.openTxid(txid, ServerChainNameEnum.testChainName, BlockExplorerEnum.Zypherscan, "");
    expect(mockOpenExternal).toHaveBeenCalledWith(`https://testnet.zypherscan.com/tx/${txid}`);
  });

  it("opens custom block explorer URL", () => {
    Utils.openTxid(txid, ServerChainNameEnum.mainChainName, BlockExplorerEnum.Custom, "https://custom.explorer/tx/");
    expect(mockOpenExternal).toHaveBeenCalledWith(`https://custom.explorer/tx/${txid}`);
  });
});

// ---------------------------------------------------------------------------
// openAddress
// ---------------------------------------------------------------------------
describe("openAddress", () => {
  const address = "u1testaddress000000000000000";

  it("opens Zcashexplorer mainnet address URL", () => {
    Utils.openAddress(address, ServerChainNameEnum.mainChainName, BlockExplorerEnum.Zcashexplorer, "");
    expect(mockOpenExternal).toHaveBeenCalledWith(`https://mainnet.zcashexplorer.app/search?qs=${address}`);
  });

  it("opens Zcashexplorer testnet address URL", () => {
    Utils.openAddress(address, ServerChainNameEnum.testChainName, BlockExplorerEnum.Zcashexplorer, "");
    expect(mockOpenExternal).toHaveBeenCalledWith(`https://testnet.zcashexplorer.app/search?qs=${address}`);
  });

  it("opens Cipherscan mainnet address URL", () => {
    Utils.openAddress(address, ServerChainNameEnum.mainChainName, BlockExplorerEnum.Cipherscan, "");
    expect(mockOpenExternal).toHaveBeenCalledWith(`https://cipherscan.app/address/${address}`);
  });

  it("opens Zypherscan testnet address URL", () => {
    Utils.openAddress(address, ServerChainNameEnum.testChainName, BlockExplorerEnum.Zypherscan, "");
    expect(mockOpenExternal).toHaveBeenCalledWith(`https://testnet.zypherscan.com/address/${address}`);
  });

  it("opens custom block explorer address URL", () => {
    Utils.openAddress(
      address,
      ServerChainNameEnum.mainChainName,
      BlockExplorerEnum.Custom,
      "https://custom.explorer/addr/",
    );
    expect(mockOpenExternal).toHaveBeenCalledWith(`https://custom.explorer/addr/${address}`);
  });
});
