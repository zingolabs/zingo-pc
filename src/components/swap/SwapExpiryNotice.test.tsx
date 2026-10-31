import React from "react";
import { act, render, waitFor } from "@testing-library/react";
import { ContextApp, defaultAppState } from "../../context/ContextAppState";
import SwapExpiryNotice from "./SwapExpiryNotice";
import { SwapDirectionEnum, SwapStatusEnum, SwapStore } from "../../swap";
import type { SwapRecordType } from "../../swap";

jest.mock("../../electronBridge");

const purchase = (status: SwapStatusEnum, overrides: Partial<SwapRecordType> = {}) =>
  ({
    recordId: "rec-1",
    direction: SwapDirectionEnum.Inbound,
    sellAsset: { ticker: "BTC", symbol: "BTC" },
    status,
    ...overrides,
  }) as SwapRecordType;

// Said while the app runs, for a change it saw: a purchase that ran out of
// time, or one paid after that.
describe("SwapExpiryNotice", () => {
  let listener: (records: SwapRecordType[]) => void = () => {};

  beforeEach(() => {
    jest.spyOn(SwapStore, "subscribe").mockImplementation((l) => {
      listener = l;
      return () => {};
    });
    jest.spyOn(SwapStore, "readAll").mockResolvedValue([purchase(SwapStatusEnum.AwaitingExternalDeposit)]);
  });

  const mount = () => {
    const openErrorModal = jest.fn();
    render(
      <ContextApp.Provider value={{ ...defaultAppState, openErrorModal }}>
        <SwapExpiryNotice />
      </ContextApp.Provider>,
    );
    return openErrorModal;
  };

  it("says a purchase seen awaiting has expired", async () => {
    const openErrorModal = mount();
    await waitFor(() => expect(SwapStore.readAll).toHaveBeenCalled());

    act(() => listener([purchase(SwapStatusEnum.Expired)]));

    expect(openErrorModal).toHaveBeenCalledWith("Deposit not detected", expect.stringMatching(/no BTC deposit/i));
  });

  it("says a late payment is going back", async () => {
    const openErrorModal = mount();
    await waitFor(() => expect(SwapStore.readAll).toHaveBeenCalled());
    act(() => listener([purchase(SwapStatusEnum.Expired)]));

    act(() => listener([purchase(SwapStatusEnum.Pending, { lateDepositAtMs: 1 })]));

    expect(openErrorModal).toHaveBeenCalledWith("Refunding", expect.stringMatching(/your BTC arrived/i));
  });
});
