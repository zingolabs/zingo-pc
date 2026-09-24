import React from "react";
import { render, screen } from "../../test-utils";
import { ShieldBalance } from "./ShieldBalance";
import { TotalBalanceClass } from "../appstate";
import { deriveMixnetView } from "../../rpc/components/mixnetPresenter";

jest.mock("../../electronBridge");

const balanceWithTransparent = (confirmedTransparentBalance: number): TotalBalanceClass =>
  ({ ...new TotalBalanceClass(), confirmedTransparentBalance }) as TotalBalanceClass;

// Shielding transmits, so it takes the same route a send does and the screens
// default to the fail-closed view. Every case that is not about the transport
// says the transport is up.
const READY = deriveMixnetView({ mode: "ready", socks5_addr: "127.0.0.1:1080" });

const show = (overrides: Record<string, unknown>, props: { shieldFee: number; anyPending: boolean }) =>
  render(<ShieldBalance {...props} />, { contextOverrides: { mixnetView: READY, ...overrides } });

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
    expect(screen.getByText(/your own shielded balance, not to anyone else/)).toBeInTheDocument();
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

  it("holds the button back until the mixnet is up, and says what it waits for", () => {
    // The wallet core refuses the transmission in this state, so a live button
    // only buys the user an error that reads like a fault in the shield.
    show(
      {
        totalBalance: balanceWithTransparent(0.05),
        readOnly: false,
        mixnetView: deriveMixnetView({ mode: "bootstrapping", bootstrap_detail: "3 of 5 hops" }),
      },
      { shieldFee: 0.00015, anyPending: false },
    );

    expect(screen.getByRole("button", { name: /Shield Transparent Balance/ })).toBeDisabled();
    // The same sentence the Send and Swap screens show, because it is the same
    // route and the same wait.
    expect(
      screen.getByText("Sending waits for the Nym mixnet to finish connecting (3 of 5 hops)."),
    ).toBeInTheDocument();
  });

  it("leaves it live when the mixnet is off for the session", () => {
    // Opting out costs privacy, not the ability to shield: the route resolves
    // to clearnet and the core transmits.
    show(
      {
        totalBalance: balanceWithTransparent(0.05),
        readOnly: false,
        mixnetView: deriveMixnetView({ mode: "switched_off" }),
      },
      { shieldFee: 0.00015, anyPending: false },
    );

    expect(screen.getByRole("button", { name: /Shield Transparent Balance/ })).toBeEnabled();
    // The route is named in every state, as on the Send screen: a line that
    // only appears when something is wrong teaches nothing about the route.
    expect(
      screen.getByText("This send will travel over clearnet — the Nym mixnet is off for this session."),
    ).toBeInTheDocument();
  });

  it("says nothing before the fee is known", () => {
    // A zero fee means the estimate has not come back yet, not a free shield.
    show({ totalBalance: balanceWithTransparent(0.05), readOnly: false }, { shieldFee: 0, anyPending: false });

    expect(screen.queryByRole("button", { name: /Shield Transparent Balance/ })).not.toBeInTheDocument();
  });
});
