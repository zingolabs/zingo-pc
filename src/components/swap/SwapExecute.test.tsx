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

const renderExecute = (
  direction: SwapDirectionEnum,
  deposit?: jest.Mock,
  instructionOverrides: Record<string, unknown> = {},
) => {
  const commitRoute = jest.fn(async () => ({
    record: record(direction),
    instructions: {
      provider: SwapKitProviderEnum.Near,
      depositAddress: direction === SwapDirectionEnum.Outbound ? "near1deposit" : "bc1qdeposit",
      amountHumanDecimal: "1.5",
      providerData: { kind: SwapKitProviderEnum.Near as const, depositAddress: "near1deposit" },
      ...instructionOverrides,
    },
  }));
  const markBroadcasted = jest.fn(async () => record(direction));
  const sendSwapDeposit = deposit ?? jest.fn(async () => ["a".repeat(64)]);
  const swapService = { commitRoute, markBroadcasted } as unknown as SwapService;
  const onDone = jest.fn();
  const onCancel = jest.fn();

  render(
    <SwapExecute
      swapService={swapService}
      quoteInput={quoteInput(direction)}
      route={route}
      fiatValueBasis={{ sellUsdUnitPrice: 30, receiveUsdUnitPrice: 60000, capturedAt: 0 }}
      direction={direction}
      sendSwapDeposit={sendSwapDeposit}
      onDone={onDone}
      onCancel={onCancel}
    />,
  );
  return { commitRoute, markBroadcasted, sendSwapDeposit, onDone, onCancel };
};

beforeEach(() => {
  jest.clearAllMocks();
  native.reserve_refund_address.mockResolvedValue(JSON.stringify({ encoded_address: EPHEMERAL }));
});

describe("SwapExecute deposit routing", () => {
  // Flashnet checks that a deposit came from the declared source address, so
  // the deposit has to leave from the transparent one the quote named rather
  // than from the shielded pool. This screen is what carries that from the
  // executor to the send, and a deposit sent the other way comes back refunded.
  it("asks for the transparent source when the provider checks the sender", async () => {
    const deposit = jest.fn(async (_args: { viaSourceAddress?: boolean }) => ["a".repeat(64)]);
    renderExecute(SwapDirectionEnum.Outbound, deposit, { requiresDepositFromSourceAddress: true });

    fireEvent.click(screen.getByRole("button", { name: /swap and send deposit/i }));

    await screen.findByText("Deposit sent");
    expect(deposit.mock.calls[0][0]).toMatchObject({ viaSourceAddress: true });
  });

  // The cheaper shape stays the default: one transaction, one fee, and the
  // payment never leaves the shielded pool.
  it("leaves a provider that checks no sender to the single send", async () => {
    const deposit = jest.fn(async (_args: { viaSourceAddress?: boolean }) => ["a".repeat(64)]);
    renderExecute(SwapDirectionEnum.Outbound, deposit);

    fireEvent.click(screen.getByRole("button", { name: /swap and send deposit/i }));

    await screen.findByText("Deposit sent");
    expect(deposit.mock.calls[0][0].viaSourceAddress).toBeUndefined();
  });
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

describe("SwapExecute deposit retry", () => {
  // The failure that prompted this was a mixnet proxy dying between the commit
  // and the send. The route is reserved at the provider by then, so the whole
  // swap turned on a transport fault the user could clear in one click.
  it("offers the deposit again when the broadcast fails", async () => {
    const deposit = jest.fn(async () => {
      throw new Error("the Nym mixnet proxy died");
    });
    renderExecute(SwapDirectionEnum.Outbound, deposit as unknown as jest.Mock);
    fireEvent.click(screen.getByRole("button", { name: /swap and send deposit/i }));

    await screen.findByText(/the deposit did not broadcast/i);
    expect(screen.getByRole("button", { name: /try the deposit again/i })).toBeInTheDocument();
  });

  // Retrying must pay the reserved swap, not open a second one: committing
  // again would reserve another route and another deposit address, and the
  // user would be holding two swaps for one intention.
  it("pays the reserved swap on the retry rather than committing a second one", async () => {
    const deposit = jest
      .fn()
      .mockRejectedValueOnce(new Error("the Nym mixnet proxy died"))
      .mockResolvedValueOnce(["b".repeat(64)]);
    const { commitRoute } = renderExecute(SwapDirectionEnum.Outbound, deposit as unknown as jest.Mock);
    fireEvent.click(screen.getByRole("button", { name: /swap and send deposit/i }));

    fireEvent.click(await screen.findByRole("button", { name: /try the deposit again/i }));

    await screen.findByText("Deposit sent");
    expect(commitRoute).toHaveBeenCalledTimes(1);
    expect(deposit).toHaveBeenCalledTimes(2);
  });

  // A successful retry has to clear the failure it followed, or the screen
  // says the deposit was both sent and not sent.
  it("clears the earlier failure once the retry lands", async () => {
    const deposit = jest
      .fn()
      .mockRejectedValueOnce(new Error("the Nym mixnet proxy died"))
      .mockResolvedValueOnce(["b".repeat(64)]);
    renderExecute(SwapDirectionEnum.Outbound, deposit as unknown as jest.Mock);
    fireEvent.click(screen.getByRole("button", { name: /swap and send deposit/i }));

    fireEvent.click(await screen.findByRole("button", { name: /try the deposit again/i }));

    await screen.findByText("Deposit sent");
    expect(screen.queryByText(/the deposit did not broadcast/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /try the deposit again/i })).not.toBeInTheDocument();
  });

  // An inbound deposit is paid from the user's other wallet. There is nothing
  // here to send again, so offering to would be a button that cannot work.
  it("does not offer a retry on an inbound swap", async () => {
    renderExecute(SwapDirectionEnum.Inbound);
    fireEvent.click(screen.getByRole("button", { name: /start the swap/i }));

    await screen.findByText("Pay this deposit");
    expect(screen.queryByRole("button", { name: /try the deposit again/i })).not.toBeInTheDocument();
  });
});

describe("SwapExecute backing out", () => {
  // Cancelling a review is not finishing a swap. Both used to call the same
  // callback, so reading a quote and stepping back wiped the amount, the
  // addresses and the quote itself — a punishment for looking before leaping.
  it("cancels without reporting the swap as done", async () => {
    const { onDone, onCancel } = renderExecute(SwapDirectionEnum.Outbound);

    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("reports done only once the swap has run", async () => {
    const { onDone, onCancel } = renderExecute(SwapDirectionEnum.Outbound);

    fireEvent.click(await screen.findByRole("button", { name: /Swap and send deposit/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Done" }));

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe("SwapExecute experimental notice", () => {
  // Said on the review as well as on the screen behind it. The banner there
  // was read once, on arrival; this is the press that spends the money.
  it("says a sent deposit cannot be called back, beside the button that sends it", async () => {
    renderExecute(SwapDirectionEnum.Outbound);

    expect(await screen.findByText(/cannot be called back/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Swap and send deposit/ })).toBeInTheDocument();
  });
});
