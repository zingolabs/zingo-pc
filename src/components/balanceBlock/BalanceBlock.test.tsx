import React from "react";
import { render, screen } from "../../test-utils";
import BalanceBlock from "./BalanceBlock";
import BalanceBlockHighlight from "./BalanceBlockHighlight";
import { ValueTransferStatusEnum } from "../appstate";

jest.mock("../../electronBridge");

// ---------------------------------------------------------------------------
// BalanceBlock
// ---------------------------------------------------------------------------
describe("BalanceBlock", () => {
  const baseProps = {
    zecValue: 1.5,
    usdValue: "$ 150.00",
    currencyName: "ZEC",
  };

  it("renders without crashing", () => {
    render(<BalanceBlock {...baseProps} />);
  });

  it("shows the currency name", () => {
    render(<BalanceBlock {...baseProps} />);
    expect(screen.getAllByText(/ZEC/)[0]).toBeInTheDocument();
  });

  it("shows the top label when provided", () => {
    render(<BalanceBlock {...baseProps} topLabel="Orchard" />);
    expect(screen.getByText("Orchard")).toBeInTheDocument();
  });

  it("shows USD value for ZEC", () => {
    render(<BalanceBlock {...baseProps} />);
    expect(screen.getByText("$ 150.00")).toBeInTheDocument();
  });

  it("hides USD value for non-ZEC currency", () => {
    render(<BalanceBlock {...baseProps} currencyName="TAZ" usdValue="$ 0.00" />);
    expect(screen.queryByText("$ 0.00")).not.toBeInTheDocument();
  });

  it("shows confirmed balance row when zecValueConfirmed differs from zecValue", () => {
    render(<BalanceBlock {...baseProps} topLabel="Orchard" zecValueConfirmed={1.0} usdValueConfirmed="$ 100.00" />);
    expect(screen.getByText("Orchard Confirmed")).toBeInTheDocument();
  });

  it("does not show confirmed row when values match", () => {
    render(<BalanceBlock {...baseProps} topLabel="Orchard" zecValueConfirmed={1.5} usdValueConfirmed="$ 150.00" />);
    expect(screen.queryByText("Orchard Confirmed")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// BalanceBlockHighlight
// ---------------------------------------------------------------------------
describe("BalanceBlockHighlight", () => {
  const baseProps = {
    zecValue: 2.0,
    usdValue: "$ 200.00",
    currencyName: "ZEC",
  };

  it("renders without crashing", () => {
    render(<BalanceBlockHighlight {...baseProps} />);
  });

  it("shows the top label with tooltip info icon when tooltip is provided", () => {
    render(<BalanceBlockHighlight {...baseProps} topLabel="Total" tooltip="Includes pending" />);
    expect(screen.getByText("Total")).toBeInTheDocument();
    // title attribute is set on the wrapper
    expect(document.querySelector("[title='Includes pending']")).not.toBeNull();
  });

  it("renders with failed status without crashing", () => {
    render(<BalanceBlockHighlight {...baseProps} status={ValueTransferStatusEnum.failed} />);
    expect(screen.getAllByText(/ZEC/)[0]).toBeInTheDocument();
  });

  it("shows confirmed row when zecValueConfirmed differs", () => {
    render(
      <BalanceBlockHighlight {...baseProps} topLabel="Balance" zecValueConfirmed={1.0} usdValueConfirmed="$ 100.00" />,
    );
    expect(screen.getByText("Balance Confirmed")).toBeInTheDocument();
  });
});
