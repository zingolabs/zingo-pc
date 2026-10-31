import { canRemoveSwap } from "./canRemoveSwap";
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
