import React from "react";
import { render as rtlRender, screen, waitFor } from "@testing-library/react";
import { render } from "../../test-utils";
import { ShieldBalance } from "./ShieldBalance";
import { ContextApp, defaultAppState } from "../../context/ContextAppState";
import {
  AppState,
  SyncStatusType,
  TotalBalanceClass,
  ValueTransferClass,
  ValueTransferKindEnum,
  ValueTransferStatusEnum,
} from "../appstate";
import { deriveMixnetView } from "../../rpc/components/mixnetPresenter";

jest.mock("../../electronBridge");

// Shielding transmits, so it takes the same route a send does and the screens
// default to the fail-closed view. Every case that is not about the transport
// says the transport is up.
const READY = deriveMixnetView({ mode: "ready", socks5_addr: "127.0.0.1:1080" });

const CAUGHT_UP: SyncStatusType = {
  percentage_total_outputs_scanned: 100,
  percentage_total_blocks_scanned: 100,
} as SyncStatusType;

const SCANNING: SyncStatusType = {
  percentage_total_outputs_scanned: 62,
  percentage_total_blocks_scanned: 60,
} as SyncStatusType;

const balanceWithTransparent = (confirmedTransparentBalance: number): TotalBalanceClass =>
  ({ ...new TotalBalanceClass(), confirmedTransparentBalance }) as TotalBalanceClass;

const pendingTransfer = (): ValueTransferClass =>
  new ValueTransferClass(ValueTransferKindEnum.sent, 1, 100, ValueTransferStatusEnum.confirmed, "txp", 0, 0.1, "addrp");

const show = (overrides: Partial<AppState>) =>
  render(<ShieldBalance />, {
    contextOverrides: {
      mixnetView: READY,
      syncingStatus: CAUGHT_UP,
      calculateShieldFee: async () => 0.00015,
      ...overrides,
    },
  });

const button = () => screen.findByRole("button", { name: /Shield Transparent Balance/ });
const noButton = () => screen.queryByRole("button", { name: /Shield Transparent Balance/ });

const EXPLANATION = /Transparent funds cannot be spent/;

describe("ShieldBalance", () => {
  it("explains why the button is there, beside the button", async () => {
    show({ totalBalance: balanceWithTransparent(0.05) });

    expect(await button()).toBeInTheDocument();
    expect(screen.getByText(EXPLANATION)).toBeInTheDocument();
  });

  it("says where the funds go, because the button does not", async () => {
    show({ totalBalance: balanceWithTransparent(0.05) });
    await button();

    // Someone told their money is stuck is not reassured by a control that
    // moves it somewhere unnamed.
    expect(screen.getByText(/your own shielded balance, not to anyone else/)).toBeInTheDocument();
  });

  it("says nothing when there is nothing to shield", async () => {
    show({ totalBalance: balanceWithTransparent(0) });

    await waitFor(() => expect(noButton()).not.toBeInTheDocument());
    expect(screen.queryByText(EXPLANATION)).not.toBeInTheDocument();
  });

  it("says nothing on a wallet that cannot spend", async () => {
    show({ totalBalance: balanceWithTransparent(0.05), readOnly: true });

    await waitFor(() => expect(noButton()).not.toBeInTheDocument());
    expect(screen.queryByText(EXPLANATION)).not.toBeInTheDocument();
  });

  it("holds the button back while transactions are pending, and says why", async () => {
    show({ totalBalance: balanceWithTransparent(0.05), valueTransfers: [pendingTransfer()] });

    expect(await screen.findByText(/Some transactions are pending/)).toBeInTheDocument();
    expect(noButton()).not.toBeInTheDocument();
  });

  it("says so when the wallet will not price a shield, rather than losing the button in silence", async () => {
    // A zero fee is how every refusal arrives, and no fee means no button. The
    // reason is the only thing standing between that and a screen the user
    // cannot make sense of.
    show({
      totalBalance: balanceWithTransparent(0.05),
      calculateShieldFee: async () => 0,
      shieldQuoteReason: "Insufficient funds",
    });

    expect(
      await screen.findByText(/shielding them is not available right now: Insufficient funds/),
    ).toBeInTheDocument();
    expect(noButton()).not.toBeInTheDocument();
  });

  it("holds the button back until the mixnet is up, and says what it waits for", async () => {
    // The wallet core refuses the transmission in this state, so a live button
    // only buys the user an error that reads like a fault in the shield.
    show({
      totalBalance: balanceWithTransparent(0.05),
      mixnetView: deriveMixnetView({ mode: "bootstrapping", bootstrap_detail: "3 of 5 hops" }),
    });

    expect(await button()).toBeDisabled();
    // The same sentence the Send and Swap screens show, because it is the same
    // route and the same wait.
    expect(
      screen.getByText("Sending waits for the Nym mixnet to finish connecting (3 of 5 hops)."),
    ).toBeInTheDocument();
  });

  it("leaves it live when the mixnet is off for the session", async () => {
    // Opting out costs privacy, not the ability to shield: the route resolves
    // to clearnet and the core transmits.
    show({ totalBalance: balanceWithTransparent(0.05), mixnetView: deriveMixnetView({ mode: "switched_off" }) });

    expect(await button()).toBeEnabled();
    // The route is named in every state, as on the Send screen: a line that
    // only appears when something is wrong teaches nothing about the route.
    expect(
      screen.getByText("This send will travel over clearnet — the Nym mixnet is off for this session."),
    ).toBeInTheDocument();
  });

  // The report this was written for: a rescan ends, the balance is the same
  // number it was while scanning, and the button never comes back — until the
  // screen is left and re-entered, which is the one thing that asked again.
  it("asks again when the wallet catches up", async () => {
    let caughtUp = false;
    const calculateShieldFee = jest.fn(async () => (caughtUp ? 0.00015 : 0));

    const Harness = ({ status }: { status: SyncStatusType }) => (
      <ContextApp.Provider
        value={{
          ...defaultAppState,
          mixnetView: READY,
          totalBalance: balanceWithTransparent(0.05),
          calculateShieldFee,
          syncingStatus: status,
        }}
      >
        <ShieldBalance />
      </ContextApp.Provider>
    );

    const { rerender } = rtlRender(<Harness status={SCANNING} />);
    await waitFor(() => expect(calculateShieldFee).toHaveBeenCalledTimes(1));
    expect(noButton()).not.toBeInTheDocument();

    caughtUp = true;
    rerender(<Harness status={CAUGHT_UP} />);

    expect(await button()).toBeInTheDocument();
  });
});
