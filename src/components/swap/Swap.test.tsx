import React, { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { act, render, screen } from "@testing-library/react";
import Swap from "./Swap";
import { ContextApp, defaultAppState } from "../../context/ContextAppState";
import { ServerChainNameEnum, TotalBalanceClass } from "../appstate";
import { SwapDirectionEnum } from "../../swap/enums/SwapDirectionEnum";
import type { TokenEntryType } from "../../swap";

jest.mock("../../electronBridge");

// The screen's catalog comes from the swap service, one per direction.
let mockService: unknown = null;
jest.mock("../../context/ContextSwapService", () => ({
  useSwapService: () => mockService,
}));

beforeAll(() => {
  const div = document.createElement("div");
  div.setAttribute("id", "root");
  document.body.appendChild(div);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("react-modal").setAppElement("#root");
});

afterEach(() => {
  mockService = null;
});

const asset = (chain: string, symbol: string, chainId: string): TokenEntryType => ({
  chain,
  chainId,
  ticker: symbol,
  identifier: `${chain}.${symbol}`,
  symbol,
  name: symbol,
  decimals: 8,
});

// Both catalogs lead with BTC, the screen's default, so a catalog that lands
// after the handoff and reselects its default visibly undoes it.
const CATALOG = [asset("BTC", "BTC", "bitcoin"), asset("SOL", "SOL", "solana")];

type Handoff = { address: string; swapChain: string; direction: SwapDirectionEnum };

/**
 * The screen as the app mounts it after an Address Book button, with a context
 * that holds the handoff in state so consuming it actually clears it.
 */
const Arriving: React.FC<{ handoff: Handoff; spendable: number }> = ({ handoff, spendable }) => {
  const [swapToState, setSwapTo] = useState<Handoff | null>(handoff);
  const totalBalance = Object.assign(new TotalBalanceClass(), { totalSpendableBalance: spendable });
  return (
    <MemoryRouter>
      <ContextApp.Provider
        value={{
          ...defaultAppState,
          totalBalance,
          currentWallet: { chain_name: ServerChainNameEnum.mainChainName } as never,
          readOnly: false,
          swapToState,
          setSwapTo,
        }}
      >
        <Swap sendSwapDeposit={jest.fn()} addAddressBookEntry={jest.fn()} />
      </ContextApp.Provider>
    </MemoryRouter>
  );
};

const serviceWithCatalogs = () => {
  // Answered at once, as the app answers it: TokenCatalog keeps the catalog in
  // memory after its first fetch, so the reload a direction flip starts lands
  // within the same few ticks as the handoff, which is when it overwrote it.
  const listRoutableTokens = jest.fn(async (_direction: "outbound" | "inbound") => CATALOG);
  mockService = { listRoutableTokens };
  return listRoutableTokens;
};

/**
 * An Address Book contact handed to the Swap screen. The catalog differs by
 * direction and reloads on a flip, selecting its default when it lands; an
 * asset picked from the catalog still on screen was replaced moments later,
 * after the address had gone in and the handoff had been consumed.
 */
describe("Swap arriving from the Address Book", () => {
  it("Swap From flips to inbound and keeps the contact's asset and refund address", async () => {
    serviceWithCatalogs();
    render(
      <Arriving
        spendable={1}
        handoff={{ address: "SoLcontactAddress", swapChain: "SOL", direction: SwapDirectionEnum.Inbound }}
      />,
    );

    // Past the inbound catalog's reload, which is what used to undo it. The
    // field is queried afterwards: the card remounts when the asset changes.
    await act(() => new Promise((resolve) => setTimeout(resolve, 80)));

    expect(screen.getByRole("textbox", { name: "Your refund address on the source chain" })).toHaveValue(
      "SoLcontactAddress",
    );
    expect(screen.getByRole("button", { name: "Change asset, currently SOL" })).toBeInTheDocument();
  });

  // The mirror case: a wallet with nothing to spend opens inbound, so Swap To
  // is the one that flips and reloads.
  it("Swap To flips to outbound and keeps the contact's asset and destination", async () => {
    serviceWithCatalogs();
    render(
      <Arriving
        spendable={0}
        handoff={{ address: "SoLcontactAddress", swapChain: "SOL", direction: SwapDirectionEnum.Outbound }}
      />,
    );

    await act(() => new Promise((resolve) => setTimeout(resolve, 80)));

    expect(screen.getByRole("textbox", { name: "Your Solana address" })).toHaveValue("SoLcontactAddress");
    expect(screen.getByRole("button", { name: "Change asset, currently SOL" })).toBeInTheDocument();
  });
});

// With no connection the catalog request never reaches SwapKit, and the screen
// used to print the transport error whole: "Error invoking remote method
// 'swapHttp:request': TypeError: fetch failed", with no way to try again.
describe("Swap with no way out to the provider", () => {
  it("says the service cannot be reached, and offers to try again", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SwapKitNetworkError } = require("../../swap");
    const listRoutableTokens = jest.fn(async () => {
      throw new SwapKitNetworkError("quote", new TypeError("fetch failed"));
    });
    mockService = { listRoutableTokens };

    render(
      <Arriving
        spendable={1}
        handoff={{ address: "SoLcontactAddress", swapChain: "SOL", direction: SwapDirectionEnum.Outbound }}
      />,
    );

    await act(() => new Promise((resolve) => setTimeout(resolve, 80)));

    expect(screen.getByText(/Can’t reach the swap service/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Retry/ })).toBeInTheDocument();
    expect(screen.queryByText(/fetch failed/)).not.toBeInTheDocument();
  });
});
