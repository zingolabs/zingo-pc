import React from "react";
import { render, screen } from "../../test-utils";
import AssetCard from "./AssetCard";

jest.mock("../../electronBridge");

const WARNING = "Check this address. A wrong one is gone.";

const show = (options: { withAddress: boolean; warning?: string }) =>
  render(
    <AssetCard
      role="source"
      isZec={false}
      token={null}
      amount="1.5"
      editable
      address={
        options.withAddress
          ? {
              label: "Your refund address on the source chain",
              value: "",
              onChange: jest.fn(),
              warning: options.warning,
            }
          : undefined
      }
    />,
  );

describe("AssetCard address warning", () => {
  // The card draws two different addresses and they fail differently, so the
  // words belong to the caller that knows which one it is asking for.
  it("shows the warning it is given", () => {
    show({ withAddress: true, warning: WARNING });
    expect(screen.getByText(WARNING)).toBeInTheDocument();
  });

  it("says nothing when given none", () => {
    show({ withAddress: true });
    expect(screen.queryByText(WARNING)).not.toBeInTheDocument();
  });

  it("says nothing on a card that takes no address", () => {
    show({ withAddress: false, warning: WARNING });
    expect(screen.queryByText(WARNING)).not.toBeInTheDocument();
  });
});
