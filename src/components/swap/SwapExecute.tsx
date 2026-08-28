import React, { useCallback, useState } from "react";
import Modal from "react-modal";

import cstyles from "../common/Common.module.css";
import styles from "../history/History.module.css";
import swapStyles from "./Swap.module.css";
import Utils from "../../utils/utils";
import { useCopy } from "../common/useCopy";
import DepositSlip from "./DepositSlip";
import { Field, FieldRow } from "./DetailField";
import { native } from "../../electronBridge";
import { SwapDirectionEnum, needsEphemeralRoute, providerLongLabel } from "../../swap";
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
      // Claim the refund address this swap was quoted against, so the next
      // inbound swap is handed the following one. Outbound needs no such call:
      // paying its own deposit applies a proposal, and that reserves the
      // address. Inbound is paid from another wallet, so without this every
      // inbound swap would name the same address and a provider could tie them
      // together.
      //
      // Failure is logged rather than surfaced. The swap is already live at the
      // provider and the address is still one this wallet watches; what is lost
      // is the freshness of the next one, which is not worth failing a swap the
      // user has just committed to.
      try {
        await native.reserve_refund_address();
      } catch (e) {
        console.error(`SwapExecute: could not reserve the refund address ${e}`);
      }
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
    const { record, instructions, txId } = postCommit;
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
        <div className={cstyles.verticalflex} style={{ height: "100%" }}>
          <div className={`${cstyles.center} ${cstyles.xlarge} ${cstyles.padtopsmall}`}>
            {txId ? "Deposit sent" : "Pay this deposit"}
          </div>
          {!!error && (
            <div className={cstyles.center} style={{ color: Utils.getCssVariable("--color-error") }}>
              {error}
            </div>
          )}

          <div style={{ overflowY: "auto", overflowX: "hidden", flexGrow: 1 }}>
            <FieldRow>
              <Field label="Provider" value={providerLongLabel(instructions.provider)} />
            </FieldRow>

            {/* The slip renders the QR only while the deposit is still unpaid.
                An outbound broadcast that succeeded has nothing left to scan;
                one that failed does, because the deposit is still payable by
                hand and the address is the useful thing on screen. */}
            <DepositSlip
              provider={instructions.provider}
              direction={direction}
              sellAsset={record.sellAsset}
              depositAddress={instructions.depositAddress}
              amountHumanDecimal={instructions.amountHumanDecimal}
              memoText={instructions.memoText}
              expiresAtMs={instructions.expiresAtMs ?? route.expiresAtMs}
              paid={!!txId}
              copy={copy}
            />

            {!!txId && <Field label="Deposit transaction" value={txId} />}

            {/* Outbound with no txid means the broadcast did not happen. The
                swap is reserved either way, so the way out is to pay it and
                come back — the History row carries an action to attach the
                transaction so tracking resumes. */}
            {isOutbound && !txId && (
              <div className={swapStyles.warningbanner}>
                The swap is reserved but nothing has been sent. Pay the deposit from this wallet or another, then open
                the swap in History and use &ldquo;Attach deposit transaction&rdquo; so tracking can resume.
              </div>
            )}
          </div>

          {copied && <div className={`${cstyles.center} ${cstyles.small}`}>Copied</div>}

          <div className={`${cstyles.center} ${cstyles.margintoplarge}`}>
            <button type="button" className={cstyles.primarybutton} onClick={onDone}>
              Done
            </button>
          </div>
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
      <div className={cstyles.verticalflex} style={{ height: "100%" }}>
        <div className={`${cstyles.center} ${cstyles.xlarge} ${cstyles.padtopsmall}`}>Review</div>

        <div style={{ overflowY: "auto", overflowX: "hidden", flexGrow: 1 }}>
          <FieldRow>
            <Field
              label="You send"
              value={`${quoteInput.sellAmountHumanDecimal} ${quoteInput.sellAsset.ticker ?? quoteInput.sellAsset.symbol}`}
            />
            <Field
              label="You receive, at least"
              value={`${route.minReceiveAmount} ${quoteInput.receiveAsset.ticker ?? quoteInput.receiveAsset.symbol}`}
            />
          </FieldRow>

          <FieldRow>
            <Field label="Route" value={providerLongLabel(route.provider)} />
            <Field label="Destination" value={quoteInput.destinationAddress} />
          </FieldRow>

          {/* The minimum is the number above because it is the one the swap
              guarantees; what the route actually expects to pay belongs here,
              as the note explaining the gap rather than a figure competing
              with it. */}
          <div className={`${cstyles.center} ${cstyles.sublight} ${cstyles.small} ${cstyles.margintoplarge}`}>
            Expected {route.expectedReceiveAmount}. The minimum is what the slippage tolerance guarantees.
          </div>

          {!!error && (
            <div
              className={`${cstyles.center} ${cstyles.margintoplarge}`}
              style={{ color: Utils.getCssVariable("--color-error") }}
            >
              {error}
            </div>
          )}
        </div>

        <div className={`${cstyles.horizontalflex} ${cstyles.margintoplarge}`} style={{ justifyContent: "center" }}>
          <button type="button" className={cstyles.primarybutton} disabled={committing} onClick={commit}>
            {committing ? "Working..." : isOutbound ? "Swap and send deposit" : "Start the swap"}
          </button>
          <button type="button" className={cstyles.primarybutton} disabled={committing} onClick={onDone}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default SwapExecute;
