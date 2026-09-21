import { matchesAllWords } from "../../utils/textSearch";
import { swapRecordSearchText, valueTransferSearchText } from "./historySearchText";
import type { ValueTransferClass } from "../appstate";
import type { SwapRecordType } from "../../swap";

const vt = (overrides: Partial<ValueTransferClass> = {}): ValueTransferClass =>
  ({
    type: "Sent",
    status: "confirmed",
    txid: "aa11".repeat(16),
    time: 0,
    confirmations: 10,
    blockheight: 1,
    amount: 0.005,
    ...overrides,
  }) as ValueTransferClass;

const matches = (text: string, query: string) => matchesAllWords(text, query);

describe("valueTransferSearchText", () => {
  // What the row shows and what the wallet stores are two spellings of one
  // amount, and the user types whichever they are looking at.
  it("finds an amount written either way", () => {
    const text = valueTransferSearchText(vt({ amount: 0.005 }));

    expect(matches(text, "0.005")).toBe(true);
    expect(matches(text, "0.00500000")).toBe(true);
  });

  it("finds a transfer by its fee", () => {
    const text = valueTransferSearchText(vt({ fee: 0.00015 }));

    expect(matches(text, "0.00015")).toBe(true);
  });

  it("keeps what it always matched: the address, the contact, the id, the memo", () => {
    const text = valueTransferSearchText(vt({ address: "u1abc", memos: ["for the pizza"] }), "Alice");

    expect(matches(text, "u1abc")).toBe(true);
    expect(matches(text, "alice")).toBe(true);
    expect(matches(text, "aa11")).toBe(true);
    expect(matches(text, "pizza")).toBe(true);
  });

  it("does not match a number the transfer does not carry", () => {
    expect(matches(valueTransferSearchText(vt({ amount: 0.005 })), "0.006")).toBe(false);
  });
});

describe("swapRecordSearchText", () => {
  const record = {
    recordId: "rec-1",
    provider: "FLASHNET",
    direction: "outbound",
    status: "completed",
    routeId: "route-9",
    providerOrderId: "order-77",
    sellAsset: { ticker: "ZEC", symbol: "ZEC", chain: "ZEC" },
    receiveAsset: { ticker: "BTC", symbol: "BTC", chain: "BTC" },
    sellAmountHumanDecimal: "1.5",
    expectedReceiveAmount: "0.002",
    actualReceiveAmount: "0.00199",
    destinationAddress: "bc1qdestination",
    depositAddress: "t1deposit",
    broadcast: { txId: "bb22".repeat(16), allTxIds: ["cc33".repeat(16), "bb22".repeat(16)] },
    destinationTxHash: "dd44".repeat(16),
    refundInfo: { refundTxHash: "ee55".repeat(16), refundReason: "the provider could not deliver" },
  } as unknown as SwapRecordType;

  // The other side of a swap exists in no transfer this wallet holds: its
  // assets, its amounts, the address it paid and the hash of every leg.
  it("offers both assets, the provider and the amounts", () => {
    const text = swapRecordSearchText(record);

    expect(matches(text, "btc")).toBe(true);
    expect(matches(text, "flashnet")).toBe(true);
    expect(matches(text, "0.00199")).toBe(true);
  });

  it("offers every code the swap carries", () => {
    const text = swapRecordSearchText(record);

    expect(matches(text, "order-77")).toBe(true);
    expect(matches(text, "route-9")).toBe(true);
    expect(matches(text, "bc1qdestination")).toBe(true);
    expect(matches(text, "cc33")).toBe(true);
    expect(matches(text, "dd44")).toBe(true);
    expect(matches(text, "ee55")).toBe(true);
  });

  it("offers what the provider said about an ending nobody asked for", () => {
    expect(matches(swapRecordSearchText(record), "could not deliver")).toBe(true);
  });
});
