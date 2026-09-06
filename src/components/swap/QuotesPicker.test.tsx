import React from "react";
import { render, screen } from "../../test-utils";
import QuotesPicker from "./QuotesPicker";
import { SwapDirectionEnum, SwapKitProviderEnum } from "../../swap";
import type { RouteOptionType } from "../../swap";

jest.mock("../../electronBridge");

const route = (routeId: string, expectedReceiveAmount: string, minReceiveAmount: string): RouteOptionType =>
  ({
    routeId,
    provider: SwapKitProviderEnum.Near,
    expectedReceiveAmount,
    minReceiveAmount,
  }) as RouteOptionType;

const show = (quotedSell?: string) =>
  render(
    <QuotesPicker
      routes={[route("a", "0.00011", "0.00009"), route("b", "0.00012", "0.00008")]}
      unavailable={[]}
      selectedRouteId="a"
      receiveSymbol="BTC"
      sellSymbol="ZEC"
      quotedSell={quotedSell}
      direction={SwapDirectionEnum.Outbound}
      modalIsOpen
      closeModal={jest.fn()}
      onSelect={jest.fn()}
    />,
  );

describe("QuotesPicker", () => {
  // The amount is what a user editing the field cannot otherwise check: the
  // routes answer whatever the last quote asked for, which is not necessarily
  // what the form holds by the time they read them.
  it("states the amount the routes were quoted for", () => {
    show("0.05 ZEC");
    expect(screen.getByText(/0\.05 ZEC/)).toBeInTheDocument();
  });

  // Stated once above the list, not per row: every route in one quote answers
  // the same amount, and repeating it is noise the reader learns to skip.
  it("states it once, however many routes came back", () => {
    show("0.05 ZEC");
    expect(screen.getAllByText(/0\.05 ZEC/)).toHaveLength(1);
  });

  it("says nothing when there is no quote to describe", () => {
    show(undefined);
    expect(screen.queryByText(/ZEC →/)).not.toBeInTheDocument();
  });

  it("still lists the routes", () => {
    show("0.05 ZEC");
    expect(screen.getByText(/0\.00011/)).toBeInTheDocument();
    expect(screen.getByText(/0\.00012/)).toBeInTheDocument();
  });
});
