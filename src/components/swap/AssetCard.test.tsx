import React from "react";
import { render, screen } from "../../test-utils";
import AssetCard from "./AssetCard";

jest.mock("../../electronBridge");

const IRRECOVERABLE = /cannot be recovered by anyone/;

const show = (withAddress: boolean) =>
  render(
    <AssetCard
      role="source"
      isZec={false}
      token={null}
      amount="1.5"
      editable
      address={
        withAddress
          ? {
              label: "Your refund address on the source chain",
              value: "",
              onChange: jest.fn(),
            }
          : undefined
      }
    />,
  );

describe("AssetCard address warning", () => {
  // The chain check catches an address for the wrong network. Nothing catches
  // a well-formed address on the right chain belonging to someone else, and
  // that is the loss worth naming — the provider does not decline to return
  // those funds, it never receives them.
  it("says a wrong address cannot be recovered, before anything is wrong", () => {
    show(true);
    expect(screen.getByText(IRRECOVERABLE)).toBeInTheDocument();
  });

  it("says nothing on a card that takes no address", () => {
    show(false);
    expect(screen.queryByText(IRRECOVERABLE)).not.toBeInTheDocument();
  });

  // No figure and no provider named. It holds for every provider and every
  // sum, and a threshold read off a support policy would suggest cover above
  // it that nobody promises.
  it("names no amount and no provider", () => {
    show(true);
    const warning = screen.getByText(IRRECOVERABLE).textContent ?? "";
    expect(warning).not.toMatch(/\$|\d/);
    expect(warning).not.toMatch(/NEAR|Thorchain|Maya|Flashnet/i);
  });
});
