import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "../../test-utils";
import SwapExecute from "./SwapExecute";
import { DepositAfterDeshieldError, SwapDirectionEnum, SwapKitProviderEnum, SwapStatusEnum } from "../../swap";
import { SwapKitHttpError } from "../../swap/errors";
import { SwapOperationEnum } from "../../swap/enums/SwapErrorCategoryEnum";
import type { QuoteInput, RouteOptionType, SwapAssetType, SwapRecordType, SwapService } from "../../swap";

jest.mock("../../electronBridge");

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { native, ipcRenderer } = require("../../electronBridge");

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
  commitFailure?: unknown,
  resume?: jest.Mock,
) => {
  const commitRoute = jest.fn(async () => {
    if (commitFailure) throw commitFailure;
    return {
      record: record(direction),
      instructions: {
        provider: SwapKitProviderEnum.Near,
        depositAddress: direction === SwapDirectionEnum.Outbound ? "near1deposit" : "bc1qdeposit",
        amountHumanDecimal: "1.5",
        providerData: { kind: SwapKitProviderEnum.Near as const, depositAddress: "near1deposit" },
        ...instructionOverrides,
      },
    };
  });
  const markBroadcasted = jest.fn(async () => record(direction));
  const markDeshielded = jest.fn(async () => record(direction));
  const markDepositSent = jest.fn(async () => record(direction));
  const sendSwapDeposit = deposit ?? jest.fn(async () => ["a".repeat(64)]);
  const resumeSwapDeposit = resume ?? jest.fn(async () => ["c".repeat(64)]);
  const swapService = { commitRoute, markBroadcasted, markDeshielded, markDepositSent } as unknown as SwapService;
  const onDone = jest.fn();
  const onCancel = jest.fn();
  const onRouteRefused = jest.fn();

  render(
    <SwapExecute
      swapService={swapService}
      quoteInput={quoteInput(direction)}
      route={route}
      fiatValueBasis={{ sellUsdUnitPrice: 30, receiveUsdUnitPrice: 60000, capturedAt: 0 }}
      direction={direction}
      sendSwapDeposit={sendSwapDeposit}
      resumeSwapDeposit={resumeSwapDeposit}
      onDone={onDone}
      onCancel={onCancel}
      onRouteRefused={onRouteRefused}
    />,
  );
  return {
    commitRoute,
    markBroadcasted,
    markDeshielded,
    markDepositSent,
    sendSwapDeposit,
    resumeSwapDeposit,
    onDone,
    onCancel,
    onRouteRefused,
  };
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

  // An ordinary send never touches the refund address, so nothing else would
  // claim it. Left unclaimed, the next swap names it again: a NEAR swap and a
  // Flashnet swap nine days apart did exactly that on mainnet.
  it("claims the refund address when an outbound deposit is an ordinary send", async () => {
    renderExecute(SwapDirectionEnum.Outbound);
    fireEvent.click(screen.getByRole("button", { name: /swap and send deposit/i }));

    await screen.findByText("Deposit sent");
    expect(native.reserve_refund_address).toHaveBeenCalledTimes(1);
  });

  // The address was named to SwapKit at the commit, so it is spoken for
  // whether or not the payment ever goes out.
  it("claims it even when that deposit fails to broadcast", async () => {
    const deposit = jest.fn(async () => {
      throw new Error("the Nym mixnet proxy died");
    });
    renderExecute(SwapDirectionEnum.Outbound, deposit);
    fireEvent.click(screen.getByRole("button", { name: /swap and send deposit/i }));

    await screen.findByText(/did not broadcast/i);
    expect(native.reserve_refund_address).toHaveBeenCalledTimes(1);
  });

  // Paying through the source address applies a proposal that reserves it.
  // Claiming first would make that proposal derive the next index and pay
  // from an address the provider was never told about.
  it("leaves the claim to the proposal when the deposit spends the source address", async () => {
    renderExecute(SwapDirectionEnum.Outbound, undefined, { requiresDepositFromSourceAddress: true });
    fireEvent.click(screen.getByRole("button", { name: /swap and send deposit/i }));

    await screen.findByText("Deposit sent");
    expect(native.reserve_refund_address).not.toHaveBeenCalled();
  });

  it("leaves the claim to the proposal when the deposit carries a memo", async () => {
    renderExecute(SwapDirectionEnum.Outbound, undefined, { memoBytes: new TextEncoder().encode("=:b:bc1q") });
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

describe("SwapExecute deposit notice", () => {
  // Beside the press that spends the money.
  it("says a sent deposit cannot be called back, beside the button that sends it", async () => {
    renderExecute(SwapDirectionEnum.Outbound);

    expect(await screen.findByText(/cannot be called back/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Swap and send deposit/ })).toBeInTheDocument();
  });
});

describe("SwapExecute device lock", () => {
  // The wallet asks for the device lock before it signs a send. Paying a swap
  // deposit signs and broadcasts the same way, so it asks here too.
  const withDeviceAuth = (success: boolean) =>
    ipcRenderer.invoke.mockImplementation(async (channel: string) =>
      channel === "loadSettings" ? { requireDeviceAuth: true } : { success },
    );

  it("asks before committing an outbound swap, and commits nothing when refused", async () => {
    withDeviceAuth(false);
    const { commitRoute, sendSwapDeposit } = renderExecute(SwapDirectionEnum.Outbound);

    fireEvent.click(screen.getByRole("button", { name: /swap and send deposit/i }));

    await waitFor(() => expect(ipcRenderer.invoke).toHaveBeenCalledWith("auth:verify", "Authorize swap deposit"));
    expect(commitRoute).not.toHaveBeenCalled();
    expect(sendSwapDeposit).not.toHaveBeenCalled();
  });

  it("goes ahead once the lock is satisfied", async () => {
    withDeviceAuth(true);
    const { sendSwapDeposit } = renderExecute(SwapDirectionEnum.Outbound);

    fireEvent.click(screen.getByRole("button", { name: /swap and send deposit/i }));

    await screen.findByText("Deposit sent");
    expect(sendSwapDeposit).toHaveBeenCalledTimes(1);
  });

  // An inbound swap is paid from the user’s other wallet: this one signs
  // nothing, so there is nothing to authorise.
  it("does not ask for an inbound swap, which spends nothing here", async () => {
    withDeviceAuth(false);
    const { commitRoute } = renderExecute(SwapDirectionEnum.Inbound);

    fireEvent.click(screen.getByRole("button", { name: /start the swap/i }));

    await screen.findByText("Pay this deposit");
    expect(commitRoute).toHaveBeenCalledTimes(1);
    expect(ipcRenderer.invoke).not.toHaveBeenCalledWith("auth:verify", expect.anything());
  });

  // The retry broadcasts the deposit on its own, without passing the commit
  // again, so it carries its own ask.
  it("asks again on the deposit retry", async () => {
    const deposit = jest.fn().mockRejectedValueOnce(new Error("the Nym mixnet proxy died"));
    withDeviceAuth(true);
    renderExecute(SwapDirectionEnum.Outbound, deposit as unknown as jest.Mock);
    fireEvent.click(screen.getByRole("button", { name: /swap and send deposit/i }));

    fireEvent.click(await screen.findByRole("button", { name: /try the deposit again/i }));

    await waitFor(() =>
      expect(ipcRenderer.invoke.mock.calls.filter((c: unknown[]) => c[0] === "auth:verify")).toHaveLength(2),
    );
  });
});

describe("SwapExecute when the provider refuses the route", () => {
  // Flashnet quoted ZEC routes for days and answered
  // `xchain_source_route_unavailable` to every commit. Pressing again asks the
  // same question about the same route id, so the press goes away and the
  // screen behind is told to stop offering the route.
  const refusal = new SwapKitHttpError({
    operation: SwapOperationEnum.Swap,
    httpStatus: 400,
    body: '{"error":"quoteError","message":"xchain_source_route_unavailable"}',
  });

  it("says why, tells the panel, and takes the press away", async () => {
    const { onRouteRefused } = renderExecute(SwapDirectionEnum.Outbound, undefined, {}, refusal);

    fireEvent.click(screen.getByRole("button", { name: /swap and send deposit/i }));

    await waitFor(() => expect(screen.getByText(/no route out of the asset you are selling/i)).toBeInTheDocument());
    expect(onRouteRefused).toHaveBeenCalledWith(expect.stringMatching(/no route out of the asset you are selling/i));
    expect(screen.queryByRole("button", { name: /swap and send deposit/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back to the routes/i })).toBeInTheDocument();
  });

  // A timeout says nothing about the route: the same press a moment later can
  // go through, so neither the button nor the panel's list changes.
  it("keeps the press for a failure that is not the route's fault", async () => {
    const { onRouteRefused } = renderExecute(SwapDirectionEnum.Outbound, undefined, {}, new Error("network down"));

    fireEvent.click(screen.getByRole("button", { name: /swap and send deposit/i }));

    await waitFor(() => expect(screen.getByText(/network down/i)).toBeInTheDocument());
    expect(onRouteRefused).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /swap and send deposit/i })).toBeInTheDocument();
  });
});

// A memo-bearing deposit is two transactions. When the first, the deshield,
// goes out and the second does not, sending the deposit again would deshield a
// second time for the same swap. The retry resumes it instead.
describe("SwapExecute deposit stopped after its deshield", () => {
  const DESHIELD = "d".repeat(64);
  const OP_RETURN = "e".repeat(64);
  const stopped = (opReturnTxId?: string) =>
    jest
      .fn()
      .mockRejectedValueOnce(new DepositAfterDeshieldError("transmission failed", "failed", DESHIELD, opReturnTxId));

  it("keeps the deshield on the record and says the retry finishes it", async () => {
    const { markDeshielded, markBroadcasted } = renderExecute(SwapDirectionEnum.Outbound, stopped());
    fireEvent.click(screen.getByRole("button", { name: /swap and send deposit/i }));

    expect(await screen.findByText(/first transaction went out/)).toBeInTheDocument();
    expect(markDeshielded).toHaveBeenCalledWith({ recordId: "rec-1", deshieldTxId: DESHIELD, opReturnTxId: undefined });
    expect(markBroadcasted).not.toHaveBeenCalled();
  });

  // zingolib refuses a new deposit while another swap's waits to resume, and
  // names that one's deshield. It is not this swap's to record or to finish.
  it("leaves another swap's held deposit alone", async () => {
    const held = jest.fn().mockRejectedValue(new DepositAfterDeshieldError("waits to resume", "pending", DESHIELD));
    const { markDeshielded, resumeSwapDeposit } = renderExecute(SwapDirectionEnum.Outbound, held);
    fireEvent.click(screen.getByRole("button", { name: /swap and send deposit/i }));

    expect(await screen.findByText(/another swap's deposit is waiting to finish/i)).toBeInTheDocument();
    expect(markDeshielded).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /try the deposit again/i }));
    await waitFor(() => expect(held).toHaveBeenCalledTimes(2));
    expect(resumeSwapDeposit).not.toHaveBeenCalled();
  });

  it.each([
    ["the OP_RETURN step was not built", undefined],
    ["the OP_RETURN transaction was built", OP_RETURN],
  ])("resumes on the retry when %s, without sending again", async (_label, opReturnTxId) => {
    const { sendSwapDeposit, resumeSwapDeposit, markBroadcasted } = renderExecute(
      SwapDirectionEnum.Outbound,
      stopped(opReturnTxId),
      {},
      undefined,
      jest.fn(async () => ["c".repeat(64)]),
    );
    fireEvent.click(screen.getByRole("button", { name: /swap and send deposit/i }));
    fireEvent.click(await screen.findByRole("button", { name: /try the deposit again/i }));

    await screen.findByText("Deposit sent");
    expect(sendSwapDeposit).toHaveBeenCalledTimes(1);
    expect(resumeSwapDeposit).toHaveBeenCalledWith(opReturnTxId);
    // The deshield first, the vault payment last: the one the provider watches.
    expect(markBroadcasted).toHaveBeenCalledWith({
      recordId: "rec-1",
      txId: "c".repeat(64),
      allTxIds: [DESHIELD, "c".repeat(64)],
    });
  });
});

// The review is the last screen before the money moves, and it said nothing
// of what the swap costs beyond the minimum received.
describe("SwapExecute review", () => {
  it("states the provider fees and what the deposit costs on Zcash", () => {
    renderExecute(SwapDirectionEnum.Outbound);

    expect(screen.getByText("Provider fees")).toBeInTheDocument();
    expect(screen.getByText(/^0\.01 ZEC \(USD 0\.30\)$/)).toBeInTheDocument();
    expect(screen.getByText("Zcash network fee")).toBeInTheDocument();
    expect(screen.getByText(/^about 0\.0002 ZEC, 1 transaction$/)).toBeInTheDocument();
  });

  it("names the refund address of a purchase, and no Zcash fee", () => {
    renderExecute(SwapDirectionEnum.Inbound);

    expect(screen.getByText("If refunded, to")).toBeInTheDocument();
    expect(screen.getByText("bc1qrefund")).toBeInTheDocument();
    expect(screen.queryByText("Zcash network fee")).not.toBeInTheDocument();
  });
});

// A purchase is paid from another wallet, which this one cannot see.
describe("SwapExecute purchase deposit", () => {
  it("keeps the moment the user confirms they sent it", async () => {
    const { markDepositSent, onDone } = renderExecute(SwapDirectionEnum.Inbound);
    fireEvent.click(screen.getByRole("button", { name: /start the swap/i }));

    fireEvent.click(await screen.findByRole("button", { name: /^i sent it$/i }));
    expect(screen.getByText(/confirm you sent exactly 1\.5 BTC to bc1qdeposit/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /yes, i sent it/i }));

    await waitFor(() => expect(markDepositSent).toHaveBeenCalledWith({ recordId: "rec-1" }));
    expect(onDone).toHaveBeenCalled();
  });
});

// A sale stopped after its deshield has the ZEC on its way already.
describe("SwapExecute half-paid sale", () => {
  it("does not suggest paying from another wallet", async () => {
    renderExecute(
      SwapDirectionEnum.Outbound,
      jest.fn().mockRejectedValueOnce(new DepositAfterDeshieldError("x", "failed", "d".repeat(64))),
    );
    fireEvent.click(screen.getByRole("button", { name: /swap and send deposit/i }));

    expect(await screen.findByText(/first transaction went out/)).toBeInTheDocument();
    expect(screen.queryByText(/pay it from another wallet/i)).not.toBeInTheDocument();
  });
});
