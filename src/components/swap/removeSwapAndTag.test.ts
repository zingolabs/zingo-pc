import { removeSwapAndTag } from "./removeSwapAndTag";
import { SwapStore, SwapDirectionEnum } from "../../swap";
import type { SwapRecordType } from "../../swap";

jest.mock("../../electronBridge");

const record = (overrides: Partial<SwapRecordType>) =>
  ({
    recordId: "rec-1",
    direction: SwapDirectionEnum.Inbound,
    destinationAddress: "t1plain",
    ...overrides,
  }) as SwapRecordType;

describe("removeSwapAndTag", () => {
  beforeEach(() => {
    jest.spyOn(SwapStore, "deleteByRecordId").mockResolvedValue();
  });

  it("Tests that the tag of the address a swap made goes when the swap is deleted", async () => {
    const removeAddresses = jest.fn();

    await removeSwapAndTag(record({ destinationAddress: "u1bought" }), removeAddresses);

    expect(SwapStore.deleteByRecordId).toHaveBeenCalledWith("rec-1");
    expect(removeAddresses).toHaveBeenCalledWith(["u1bought"]);
  });

  it("Tests that the address book is left alone when the deleted swap made no address", async () => {
    const removeAddresses = jest.fn();

    await removeSwapAndTag(record({}), removeAddresses);

    expect(removeAddresses).not.toHaveBeenCalled();
  });
});
