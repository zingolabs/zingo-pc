import ValueTransferClass from "../components/appstate/classes/ValueTransferClass";
import { ValueTransferKindEnum } from "../components/appstate/enums/ValueTransferKindEnum";
import { ValueTransferStatusEnum } from "../components/appstate/enums/ValueTransferStatusEnum";
import { SwapDirectionEnum } from "./enums/SwapDirectionEnum";
import { SwapKitProviderEnum } from "./enums/SwapKitProviderEnum";
import { SwapStatusEnum } from "./enums/SwapStatusEnum";
import { groupHistoryBySwap, sliceKeepingGroups, swapGroupOf, swapTxidIndex } from "./groupHistoryBySwap";
import { swapRecordToValueTransfer } from "./swapRecordToValueTransfer";
import type { SwapAssetType } from "./types/SwapAssetType";
import type { SwapRecordType } from "./types/SwapRecordType";

const ZEC: SwapAssetType = {
  swapKitId: "ZEC.ZEC",
  chain: "ZEC",
  symbol: "ZEC",
  ticker: "ZEC",
  chainId: "zcash",
  decimals: 8,
};
const BTC: SwapAssetType = {
  swapKitId: "BTC.BTC",
  chain: "BTC",
  symbol: "BTC",
  ticker: "BTC",
  chainId: "bitcoin",
  decimals: 8,
};

const hash = (seed: string) => seed.repeat(64 / seed.length);
const HOP = hash("a1");
const DEPOSIT = hash("b2");
const REFUND = hash("c3");
const DELIVERY = hash("d4");
const UNRELATED = hash("e5");
const EARLIER = hash("f6");

const swap = (overrides: Partial<SwapRecordType>): SwapRecordType => ({
  recordId: "rec-out",
  depositAddress: "t1deposit",
  provider: SwapKitProviderEnum.Flashnet,
  direction: SwapDirectionEnum.Outbound,
  routeId: "route",
  sellAsset: ZEC,
  receiveAsset: BTC,
  sellAmountHumanDecimal: "0.01",
  expectedReceiveAmount: "0.0001",
  minReceiveAmount: "0.00009",
  destinationAddress: "bc1qdestination",
  sourceAddress: "t1ephemeral",
  status: SwapStatusEnum.Refunded,
  providerData: { kind: SwapKitProviderEnum.Flashnet },
  fiatValueBasis: { sellUsdUnitPrice: 1, receiveUsdUnitPrice: 1, capturedAt: 0 },
  createdAtMs: 1_000_000,
  updatedAtMs: 1_000_000,
  ...overrides,
});

const tx = (txid: string, timeSec: number, type = ValueTransferKindEnum.sent): ValueTransferClass =>
  new ValueTransferClass(type, 1, 0, ValueTransferStatusEnum.confirmed, txid, timeSec, 0.01, "t1somewhere");

const newestFirst = (rows: ValueTransferClass[]) => [...rows].sort((a, b) => b.time - a.time);
const ids = (rows: ValueTransferClass[]) =>
  rows.map((vt) => (vt.type === ValueTransferKindEnum.swap ? `swap:${vt.swapRecordId}` : vt.txid));

// A two-transaction outbound deposit refunded hours later, with an unrelated
// transaction in between: the case that reads worst in time order.
const outboundRefunded = swap({
  broadcast: { txId: DEPOSIT, allTxIds: [HOP, DEPOSIT] } as SwapRecordType["broadcast"],
  observedDepositTxHash: DEPOSIT,
  refundInfo: { refundTxHash: REFUND },
});

describe("swapTxidIndex", () => {
  it("indexes every Zcash transaction of a swap selling ZEC, refund included", () => {
    const index = swapTxidIndex([outboundRefunded]);

    expect([...index.entries()].sort()).toEqual([HOP, DEPOSIT, REFUND].map((h) => [h, "rec-out"]).sort());
  });

  // The deposit of a swap buying ZEC is on the other chain and never matches a
  // row of this wallet; its delivery does.
  it("indexes only the delivery of a swap buying ZEC", () => {
    const inbound = swap({
      recordId: "rec-in",
      direction: SwapDirectionEnum.Inbound,
      sellAsset: BTC,
      receiveAsset: ZEC,
      observedDepositTxHash: "btcdeposithash",
      destinationTxHash: DELIVERY,
      status: SwapStatusEnum.Completed,
    });

    expect([...swapTxidIndex([inbound]).entries()]).toEqual([[DELIVERY, "rec-in"]]);
  });

  it("skips placeholders", () => {
    const pending = swap({ broadcast: { txId: "0x" + "0".repeat(64) } as SwapRecordType["broadcast"] });

    expect(swapTxidIndex([pending]).size).toBe(0);
  });
});

describe("groupHistoryBySwap", () => {
  it("pulls a swap's transactions under it, oldest first, even from hours later", () => {
    const rows = newestFirst([
      swapRecordToValueTransfer(outboundRefunded), // t=1000
      tx(HOP, 1001),
      tx(DEPOSIT, 1100),
      tx(UNRELATED, 5000),
      tx(REFUND, 9000, ValueTransferKindEnum.received),
      tx(EARLIER, 500),
    ]);

    const grouped = groupHistoryBySwap(rows, swapTxidIndex([outboundRefunded]));

    expect(ids(grouped)).toEqual([UNRELATED, "swap:rec-out", HOP, DEPOSIT, REFUND, EARLIER]);
  });

  it("groups an inbound swap with its delivery", () => {
    const inbound = swap({
      recordId: "rec-in",
      direction: SwapDirectionEnum.Inbound,
      sellAsset: BTC,
      receiveAsset: ZEC,
      observedDepositTxHash: "btcdeposithash",
      destinationTxHash: DELIVERY,
      status: SwapStatusEnum.Completed,
    });
    const rows = newestFirst([
      swapRecordToValueTransfer(inbound),
      tx(UNRELATED, 2000),
      tx(DELIVERY, 3000, ValueTransferKindEnum.received),
    ]);

    expect(ids(groupHistoryBySwap(rows, swapTxidIndex([inbound])))).toEqual([UNRELATED, "swap:rec-in", DELIVERY]);
  });

  it("keeps every row, once", () => {
    const rows = newestFirst([
      swapRecordToValueTransfer(outboundRefunded),
      tx(HOP, 1001),
      tx(DEPOSIT, 1100),
      tx(UNRELATED, 5000),
    ]);

    const grouped = groupHistoryBySwap(rows, swapTxidIndex([outboundRefunded]));

    expect(grouped).toHaveLength(rows.length);
    expect(new Set(grouped)).toEqual(new Set(rows));
  });

  it("leaves a transaction alone when its swap has no row", () => {
    const rows = newestFirst([tx(DEPOSIT, 1100), tx(UNRELATED, 5000)]);

    expect(ids(groupHistoryBySwap(rows, swapTxidIndex([outboundRefunded])))).toEqual([UNRELATED, DEPOSIT]);
  });
});

describe("sliceKeepingGroups", () => {
  it("does not end a page halfway through a swap", () => {
    const index = swapTxidIndex([outboundRefunded]);
    const grouped = groupHistoryBySwap(
      newestFirst([
        swapRecordToValueTransfer(outboundRefunded),
        tx(HOP, 1001),
        tx(DEPOSIT, 1100),
        tx(REFUND, 9000),
        tx(EARLIER, 500),
      ]),
      index,
    );

    const page = sliceKeepingGroups(grouped, 2, (vt) => swapGroupOf(vt, index));

    expect(ids(page)).toEqual(["swap:rec-out", HOP, DEPOSIT, REFUND]);
  });

  it("cuts where asked between rows of no swap", () => {
    const rows = [tx(UNRELATED, 5000), tx(EARLIER, 500), tx(hash("99"), 100)];

    expect(sliceKeepingGroups(rows, 2, () => undefined)).toHaveLength(2);
  });
});
