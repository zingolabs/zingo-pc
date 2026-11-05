import { UNKNOWN_HASH_MS, canRemoveSwap } from "./canRemoveSwap";
import { BroadcastStatusEnum } from "./enums/BroadcastStatusEnum";
import { SwapDirectionEnum } from "./enums/SwapDirectionEnum";
import { SwapStatusEnum } from "./enums/SwapStatusEnum";
import type { SwapRecordType } from "./types/SwapRecordType";

const HASH = "a".repeat(64);

const swap = (overrides: Partial<SwapRecordType>): SwapRecordType =>
  ({ direction: SwapDirectionEnum.Outbound, status: SwapStatusEnum.Pending, ...overrides }) as SwapRecordType;

// Only a swap where no money moved can be deleted, so funds in motion are
// never hidden.
describe("canRemoveSwap", () => {
  it("lets an unpaid sale go", () => {
    expect(canRemoveSwap(swap({ status: SwapStatusEnum.PendingDeposit }))).toBe(true);
  });

  it("keeps a sale whose deposit stopped after its deshield", () => {
    const halfPaid = { status: BroadcastStatusEnum.PendingBroadcast, allTxIds: [HASH] };
    expect(canRemoveSwap(swap({ status: SwapStatusEnum.PendingDeposit, broadcast: halfPaid }))).toBe(false);
    expect(canRemoveSwap(swap({ status: SwapStatusEnum.Expired, broadcast: halfPaid }))).toBe(false);
  });

  it.each([SwapStatusEnum.Expired, SwapStatusEnum.Failed])("lets a %s swap with no deposit seen go", (status) => {
    expect(canRemoveSwap(swap({ status }))).toBe(true);
    expect(canRemoveSwap(swap({ status, direction: SwapDirectionEnum.Inbound }))).toBe(true);
  });

  it.each([SwapStatusEnum.Expired, SwapStatusEnum.Failed])("keeps a %s swap the provider saw paid", (status) => {
    expect(canRemoveSwap(swap({ status, broadcast: { status: BroadcastStatusEnum.Broadcasted, txId: HASH } }))).toBe(
      false,
    );
    expect(canRemoveSwap(swap({ status, direction: SwapDirectionEnum.Inbound, observedDepositTxHash: HASH }))).toBe(
      false,
    );
  });

  it.each([
    SwapStatusEnum.AwaitingExternalDeposit,
    SwapStatusEnum.Pending,
    SwapStatusEnum.Processing,
    SwapStatusEnum.ProviderStatusUnknown,
    SwapStatusEnum.IncompleteDeposit,
    SwapStatusEnum.Completed,
    SwapStatusEnum.Refunded,
  ])("keeps a %s swap", (status) => {
    expect(canRemoveSwap(swap({ status }))).toBe(false);
  });
});

describe("a swap in progress on a hash", () => {
  const stuckAtMs = 1_700_000_000_000;
  const dayLater = stuckAtMs + UNKNOWN_HASH_MS;
  const pending = (overrides: Partial<SwapRecordType> = {}) =>
    swap({
      direction: SwapDirectionEnum.Inbound,
      status: SwapStatusEnum.Pending,
      observedDepositTxHash: "ab12",
      updatedAtMs: stuckAtMs,
      ...overrides,
    });

  it("Tests that it can be deleted when /track has not recognised it in a day", () => {
    expect(canRemoveSwap(pending(), dayLater)).toBe(true);
  });

  it("Tests that it stays when the day has not passed", () => {
    expect(canRemoveSwap(pending(), dayLater - 1)).toBe(false);
  });

  it("Tests that it stays when /track has answered for it", () => {
    expect(canRemoveSwap(pending({ trackCaptureVersion: 1 }), dayLater)).toBe(false);
  });

  it("Tests that it stays when it has no hash", () => {
    expect(canRemoveSwap(pending({ observedDepositTxHash: undefined }), dayLater)).toBe(false);
  });
});
