import React from "react";
import { fireEvent, screen } from "@testing-library/react";
import { render } from "../../test-utils";
import SwapExecute from "./SwapExecute";
import { SwapDirectionEnum, SwapKitProviderEnum, SwapStatusEnum } from "../../swap";
import type { QuoteInput, RouteOptionType, SwapAssetType, SwapRecordType, SwapService } from "../../swap";

jest.mock("../../electronBridge");

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { native } = require("../../electronBridge");

beforeAll(() => {
  const div = document.createElement("div");
  div.setAttribute("id", "root");
  document.body.appendChild(div);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("react-modal").setAppElement("#root");
});

const ZEC: SwapAssetType = {
  swapKitId: "ZEC.ZEC",
  chain: "ZEC",
  symbol: "ZEC",
  ticker: "ZEC",
  chainId: "zcash",
  decimals: 8,
};

const BTC: SwapAssetType = {
  swapKitId: "BTC.BTC",
  chain: "BTC",
  symbol: "BTC",
  ticker: "BTC",
  chainId: "bitcoin",
  decimals: 8,
};

const EPHEMERAL = "t1ephemeralrefundaddress";

const route: RouteOptionType = {
  routeId: "route-1",
  provider: SwapKitProviderEnum.Near,
  expectedReceiveAmount: "0.002",
  minReceiveAmount: "0.0019",
  totalFeesInReceiveAsset: "0.00001",
  bridgeFeesInReceiveAsset: "0",
  totalFeesInSellAsset: "0.01",
  bridgeFeesInSellAsset: "0",
};

const record = (direction: SwapDirectionEnum): SwapRecordType => ({
  recordId: "rec-1",
  depositAddress: direction === SwapDirectionEnum.Outbound ? "near1deposit" : "bc1qdeposit",
  provider: SwapKitProviderEnum.Near,
  direction,
  routeId: "route-1",
  sellAsset: direction === SwapDirectionEnum.Outbound ? ZEC : BTC,
  receiveAsset: direction === SwapDirectionEnum.Outbound ? BTC : ZEC,
  sellAmountHumanDecimal: "1.5",
  expectedReceiveAmount: "0.002",
  minReceiveAmount: "0.0019",
  destinationAddress: direction === SwapDirectionEnum.Outbound ? "bc1qdestination" : EPHEMERAL,
  sourceAddress: direction === SwapDirectionEnum.Outbound ? EPHEMERAL : "bc1qrefund",
  status: SwapStatusEnum.PendingDeposit,
  providerData: { kind: SwapKitProviderEnum.Near, depositAddress: "near1deposit" },
  fiatValueBasis: { sellUsdUnitPrice: 30, receiveUsdUnitPrice: 60000, capturedAt: 0 },
  createdAtMs: 1_700_000_000_000,
  updatedAtMs: 1_700_000_000_000,
});

const quoteInput = (direction: SwapDirectionEnum): QuoteInput => ({
  sellAsset: direction === SwapDirectionEnum.Outbound ? ZEC : BTC,
  receiveAsset: direction === SwapDirectionEnum.Outbound ? BTC : ZEC,
  sellAmountHumanDecimal: "1.5",
  sourceAddress: direction === SwapDirectionEnum.Outbound ? EPHEMERAL : "bc1qrefund",
  destinationAddress: direction === SwapDirectionEnum.Outbound ? "bc1qdestination" : EPHEMERAL,
});

const renderExecute = (direction: SwapDirectionEnum) => {
  const commitRoute = jest.fn(async () => ({
    record: record(direction),
    instructions: {
      provider: SwapKitProviderEnum.Near,
      depositAddress: direction === SwapDirectionEnum.Outbound ? "near1deposit" : "bc1qdeposit",
      amountHumanDecimal: "1.5",
      providerData: { kind: SwapKitProviderEnum.Near as const, depositAddress: "near1deposit" },
    },
  }));
  const markBroadcasted = jest.fn(async () => record(direction));
  const sendSwapDeposit = jest.fn(async () => ["a".repeat(64)]);
  const swapService = { commitRoute, markBroadcasted } as unknown as SwapService;

  render(
    <SwapExecute
      swapService={swapService}
      quoteInput={quoteInput(direction)}
      route={route}
      fiatValueBasis={{ sellUsdUnitPrice: 30, receiveUsdUnitPrice: 60000, capturedAt: 0 }}
      direction={direction}
      sendSwapDeposit={sendSwapDeposit}
      onDone={jest.fn()}
    />,
  );
  return { commitRoute, sendSwapDeposit };
};

beforeEach(() => {
  jest.clearAllMocks();
  native.reserve_refund_address.mockResolvedValue(JSON.stringify({ encoded_address: EPHEMERAL }));
});

describe("SwapExecute refund-address claiming", () => {
  // An inbound swap is paid from another wallet, so this one never builds a
  // transaction bearing the address and nothing else would claim it. Without
  // the claim, every inbound swap is handed the same address and a provider
  // can tie them together.
  it("claims the refund address once an inbound route is committed", async () => {
    renderExecute(SwapDirectionEnum.Inbound);
    fireEvent.click(screen.getByRole("button", { name: /start the swap/i }));

    await screen.findByText("Pay this deposit");
    expect(native.reserve_refund_address).toHaveBeenCalledTimes(1);
  });

  // Outbound pays its own deposit, and applying that proposal reserves the
  // address. Claiming here as well would consume two indices per swap and
  // leave the one SwapKit was told about unused.
  it("leaves the claim to the proposal on an outbound swap", async () => {
    renderExecute(SwapDirectionEnum.Outbound);
    fireEvent.click(screen.getByRole("button", { name: /swap and send deposit/i }));

    await screen.findByText("Deposit sent");
    expect(native.reserve_refund_address).not.toHaveBeenCalled();
  });

  // The swap is live at the provider by then, and the address is still one this
  // wallet watches. Losing the freshness of the next address is not worth
  // failing a swap the user has already committed to.
  it("still shows the deposit slip when the claim fails", async () => {
    native.reserve_refund_address.mockRejectedValue(new Error("no lightclient"));
    renderExecute(SwapDirectionEnum.Inbound);
    fireEvent.click(screen.getByRole("button", { name: /start the swap/i }));

    await screen.findByText("Pay this deposit");
    expect(screen.getByText("bc1qdeposit")).toBeInTheDocument();
  });
});
