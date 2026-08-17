import React, { useCallback, useState } from "react";
import Modal from "react-modal";

import cstyles from "../common/Common.module.css";
import styles from "../history/History.module.css";
import Utils from "../../utils/utils";
import { useCopy } from "../common/useCopy";
import { SwapDirectionEnum, SwapKitProviderEnum, providerLongLabel } from "../../swap";
import type {
  DepositInstructionsType,
  FiatValueBasisType,
  QuoteInput,
  RouteOptionType,
  SwapRecordType,
  SwapService,
} from "../../swap";

/**
 * Zatoshis for a ZEC amount written in display units.
 *
 * `Math.round` rather than a bare `* 1e8`: the multiplication drifts by an ULP
 * on exactly the boundary values a currency field produces, and a deposit that
 * is one zatoshi short is a deposit the provider refunds.
 */
function zecToZatoshis(amountHumanDecimal: string): number {
  return Math.round(parseFloat(amountHumanDecimal) * 1e8);
}

/**
 * Whether the deposit has to leave through the ZIP 320 ephemeral hop.
 *
 * Mayachain and THORChain read a swap's refund destination from the inbound
 * transaction's origin, which a shielded spend does not expose, and the
 * ~80-byte OP_RETURN is too tight to carry a `/REFUNDADDR` clause instead.
 * NEAR Intents and Flashnet bind refunds to the per-quote deposit address, so
 * they need none of this and take the cheaper single-hop path.
 */
function needsEphemeralRoute(provider: SwapKitProviderEnum): boolean {
  return provider === SwapKitProviderEnum.MayachainStreaming || provider === SwapKitProviderEnum.ThorchainStreaming;
}

type SwapExecuteProps = {
  swapService: SwapService;
  quoteInput: QuoteInput;
  route: RouteOptionType;
  fiatValueBasis: FiatValueBasisType;
  direction: SwapDirectionEnum;
  sendSwapDeposit: (args: {
    depositAddress: string;
    amountAtomic: number;
    memoBytes?: Uint8Array;
    routeViaEphemeral?: boolean;
  }) => Promise<string[]>;
  onDone: () => void;
};

type PostCommit = {
  record: SwapRecordType;
  instructions: DepositInstructionsType;
  txId?: string;
};

/**
 * Commits the chosen route and, for an outbound swap, pays its deposit.
 *
 * Two phases. Before the commit the user is looking at a summary they can
 * still back out of. After it the swap exists at the provider and locally, so
 * the view turns into deposit instructions: for an inbound swap that is what
 * the user needs in order to pay from their other wallet, and for an outbound
 * one it is the fallback if the broadcast fails, since the deposit can still
 * be paid by hand.
 */
const SwapExecute: React.FC<SwapExecuteProps> = ({
  swapService,
  quoteInput,
  route,
  fiatValueBasis,
  direction,
  sendSwapDeposit,
  onDone,
}) => {
  const [committing, setCommitting] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [postCommit, setPostCommit] = useState<PostCommit | null>(null);
  const { copied, copy } = useCopy(1500);

  const isOutbound = direction === SwapDirectionEnum.Outbound;

  const commit = useCallback(async () => {
    setCommitting(true);
    setError("");

    // The record exists locally from here on, whatever happens to the
    // broadcast below. That is deliberate: a swap the provider has reserved
    // must be visible to the user even if this wallet never manages to pay it.
    let committed;
    try {
      committed = await swapService.commitRoute({ quoteInput, chosenRoute: route, direction, fiatValueBasis });
    } catch (e) {
      setError(`Could not start the swap: ${e}`);
      setCommitting(false);
      return;
    }

    if (!isOutbound) {
      setPostCommit({ record: committed.record, instructions: committed.instructions });
      setCommitting(false);
      return;
    }

    try {
      const txIds = await sendSwapDeposit({
        depositAddress: committed.instructions.depositAddress,
        amountAtomic: zecToZatoshis(committed.instructions.amountHumanDecimal),
        memoBytes: committed.instructions.memoBytes,
        routeViaEphemeral: needsEphemeralRoute(committed.instructions.provider),
      });
      // The provider watches the transaction that pays the vault, which is the
      // last one: a two-hop send emits shielded → ephemeral first. Taking the
      // last regardless of length also survives a future step being added in
      // the middle.
      const depositTxId = txIds[txIds.length - 1];
      const record = await swapService.markBroadcasted({
        recordId: committed.record.recordId,
        txId: depositTxId,
        allTxIds: txIds,
      });
      setPostCommit({ record, instructions: committed.instructions, txId: depositTxId });
    } catch (e) {
      // Falling back to the instructions rather than an error alone: the swap
      // is reserved and payable by hand, so the address and amount are the
      // useful thing to show.
      setError(`The deposit did not broadcast: ${e}`);
      setPostCommit({ record: committed.record, instructions: committed.instructions });
    } finally {
      setCommitting(false);
    }
  }, [swapService, quoteInput, route, fiatValueBasis, direction, isOutbound, sendSwapDeposit]);

  if (postCommit) {
    const { instructions, txId } = postCommit;
    return (
      <Modal
        isOpen
        // No dismissal once the swap is reserved. The provider is holding a
        // quote against this deposit address, and closing on a stray click or
        // an Escape would take the address and the exact amount off screen
        // with nothing yet paid.
        shouldCloseOnOverlayClick={false}
        shouldCloseOnEsc={false}
        className={styles.txmodal}
        overlayClassName={styles.txmodalOverlay}
      >
        <div className={cstyles.large}>{txId ? "Deposit sent" : "Pay this deposit"}</div>
        {!!error && <div style={{ color: Utils.getCssVariable("--color-error") }}>{error}</div>}

        <div className={cstyles.padtopsmall}>
          <div className={`${cstyles.sublight} ${cstyles.small}`}>Provider</div>
          <div>{providerLongLabel(instructions.provider)}</div>
        </div>

        <div className={cstyles.padtopsmall}>
          <div className={`${cstyles.sublight} ${cstyles.small}`}>Deposit address</div>
          <div style={{ wordBreak: "break-all" }}>{instructions.depositAddress}</div>
          <button type="button" className={cstyles.primarybutton} onClick={() => copy(instructions.depositAddress)}>
            Copy address
          </button>
        </div>

        <div className={cstyles.padtopsmall}>
          <div className={`${cstyles.sublight} ${cstyles.small}`}>Exact amount</div>
          <div>{instructions.amountHumanDecimal}</div>
          {!isOutbound && (
            <div className={`${cstyles.sublight} ${cstyles.small}`}>
              Send this amount exactly. A short payment is refunded rather than swapped.
            </div>
          )}
        </div>

        {!!instructions.memoText && (
          <div className={cstyles.padtopsmall}>
            <div className={`${cstyles.sublight} ${cstyles.small}`}>Memo</div>
            <div style={{ wordBreak: "break-all" }}>{instructions.memoText}</div>
            <button type="button" className={cstyles.primarybutton} onClick={() => copy(instructions.memoText ?? "")}>
              Copy memo
            </button>
            <div className={`${cstyles.sublight} ${cstyles.small}`}>
              The memo is what tells the provider which swap this payment belongs to. A deposit without it cannot be
              matched.
            </div>
          </div>
        )}

        {!!txId && (
          <div className={cstyles.padtopsmall}>
            <div className={`${cstyles.sublight} ${cstyles.small}`}>Deposit transaction</div>
            <div style={{ wordBreak: "break-all" }}>{txId}</div>
          </div>
        )}

        {copied && <div className={cstyles.small}>Copied</div>}

        <div className={`${cstyles.center} ${cstyles.padtopsmall}`}>
          <button type="button" className={cstyles.primarybutton} onClick={onDone}>
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen
      // Dismissable here, unlike after the commit: nothing has been reserved
      // yet, so backing out costs the user nothing.
      onRequestClose={committing ? undefined : onDone}
      shouldCloseOnOverlayClick={!committing}
      shouldCloseOnEsc={!committing}
      className={styles.txmodal}
      overlayClassName={styles.txmodalOverlay}
    >
      <div className={cstyles.large}>Review</div>

      <div className={cstyles.padtopsmall}>
        <div className={`${cstyles.sublight} ${cstyles.small}`}>Route</div>
        <div>{providerLongLabel(route.provider)}</div>
      </div>

      <div className={cstyles.padtopsmall}>
        <div className={`${cstyles.sublight} ${cstyles.small}`}>You send</div>
        <div>
          {quoteInput.sellAmountHumanDecimal} {quoteInput.sellAsset.ticker ?? quoteInput.sellAsset.symbol}
        </div>
      </div>

      <div className={cstyles.padtopsmall}>
        <div className={`${cstyles.sublight} ${cstyles.small}`}>You receive, at least</div>
        <div>
          {route.minReceiveAmount} {quoteInput.receiveAsset.ticker ?? quoteInput.receiveAsset.symbol}
        </div>
        <div className={`${cstyles.sublight} ${cstyles.small}`}>
          Expected {route.expectedReceiveAmount}. The minimum is what the slippage tolerance guarantees.
        </div>
      </div>

      <div className={cstyles.padtopsmall}>
        <div className={`${cstyles.sublight} ${cstyles.small}`}>Destination</div>
        <div style={{ wordBreak: "break-all" }}>{quoteInput.destinationAddress}</div>
      </div>

      {!!error && <div style={{ color: Utils.getCssVariable("--color-error") }}>{error}</div>}

      <div className={`${cstyles.center} ${cstyles.horizontalflex} ${cstyles.padtopsmall}`}>
        <button type="button" className={cstyles.primarybutton} disabled={committing} onClick={commit}>
          {committing ? "Working..." : isOutbound ? "Swap and send deposit" : "Start the swap"}
        </button>
        <button type="button" className={cstyles.primarybutton} disabled={committing} onClick={onDone}>
          Cancel
        </button>
      </div>
    </Modal>
  );
};

export default SwapExecute;
