import React from "react";
import { render, screen } from "../../test-utils";
import { ShieldBalance } from "./ShieldBalance";
import { TotalBalanceClass } from "../appstate";

jest.mock("../../electronBridge");

const balanceWithTransparent = (confirmedTransparentBalance: number): TotalBalanceClass =>
  ({ ...new TotalBalanceClass(), confirmedTransparentBalance }) as TotalBalanceClass;

const show = (overrides: Record<string, unknown>, props: { shieldFee: number; anyPending: boolean }) =>
  render(<ShieldBalance {...props} />, { contextOverrides: overrides });

const EXPLANATION = /Transparent funds cannot be spent/;

describe("ShieldBalance", () => {
  it("explains why the button is there, beside the button", () => {
    show({ totalBalance: balanceWithTransparent(0.05), readOnly: false }, { shieldFee: 0.00015, anyPending: false });

    expect(screen.getByRole("button", { name: /Shield Transparent Balance/ })).toBeInTheDocument();
    expect(screen.getByText(EXPLANATION)).toBeInTheDocument();
  });

  it("says where the funds go, because the button does not", () => {
    show({ totalBalance: balanceWithTransparent(0.05), readOnly: false }, { shieldFee: 0.00015, anyPending: false });

    // Someone told their money is stuck is not reassured by a control that
    // moves it somewhere unnamed.
    expect(screen.getByText(/your own shielded balance/)).toBeInTheDocument();
    expect(screen.getByText(/does not send them to anyone/)).toBeInTheDocument();
  });

  it("says nothing when there is nothing to shield", () => {
    show({ totalBalance: balanceWithTransparent(0), readOnly: false }, { shieldFee: 0.00015, anyPending: false });

    expect(screen.queryByRole("button", { name: /Shield Transparent Balance/ })).not.toBeInTheDocument();
    expect(screen.queryByText(EXPLANATION)).not.toBeInTheDocument();
  });

  it("says nothing on a wallet that cannot spend", () => {
    show({ totalBalance: balanceWithTransparent(0.05), readOnly: true }, { shieldFee: 0.00015, anyPending: false });

    expect(screen.queryByRole("button", { name: /Shield Transparent Balance/ })).not.toBeInTheDocument();
  });

  it("holds the button back while transactions are pending, and says why", () => {
    show({ totalBalance: balanceWithTransparent(0.05), readOnly: false }, { shieldFee: 0.00015, anyPending: true });

    expect(screen.queryByRole("button", { name: /Shield Transparent Balance/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Some transactions are pending/)).toBeInTheDocument();
  });

  it("says nothing before the fee is known", () => {
    // A zero fee means the estimate has not come back yet, not a free shield.
    show({ totalBalance: balanceWithTransparent(0.05), readOnly: false }, { shieldFee: 0, anyPending: false });

    expect(screen.queryByRole("button", { name: /Shield Transparent Balance/ })).not.toBeInTheDocument();
  });
});
