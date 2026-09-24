import React, { useContext, useEffect, useMemo, useState } from "react";

import { ContextApp } from "../../context/ContextAppState";
import { ValueTransferClass, ValueTransferStatusEnum } from "../appstate";
import { describeSendRoute } from "../../rpc/components/mixnetPresenter";
import cstyles from "../common/Common.module.css";

/**
 * The Shield Transparent Balance button, with the sentences that say why it is
 * there and where what it does will travel.
 *
 * The wallet cannot spend transparent funds. `max_send_value` in zingolib
 * starts from `shielded_spendable_balance`, so a wallet holding nothing but
 * transparent coins shows a balance and no spendable funds — and the user is
 * left looking at money the Send screen will not let them move, with no
 * explanation. A button labelled only with its action does not supply one:
 * "shield" is the remedy's name, not the problem's.
 *
 * One component rather than the copy this replaced in five screens, and it
 * owns the whole block now: the fee, what counts as pending, and the reason
 * when there is no fee to show. Each of those was duplicated in all five, and
 * the duplication is what let the button behave differently depending on which
 * screen you happened to be on.
 *
 * Shielding transmits, and it ends in the same route policy a send does, so it
 * waits for the same transport: with the mixnet bootstrapping, lost or
 * unreadable, the wallet core refuses it. The Send and Swap screens have always
 * said so and held their buttons back; this one let the user press it and meet
 * the refusal as an error, which reads like a fault in the shield rather than a
 * transport that is not up yet.
 */
export function ShieldBalance() {
  const {
    totalBalance,
    readOnly,
    handleShieldButton,
    mixnetView,
    calculateShieldFee,
    shieldQuoteReason,
    valueTransfers,
    syncingStatus,
  } = useContext(ContextApp);

  const [shieldFee, setShieldFee] = useState<number>(0);

  const anyPending: boolean = useMemo(
    () =>
      valueTransfers
        .filter((vt: ValueTransferClass) => vt.status !== ValueTransferStatusEnum.failed)
        .some((vt: ValueTransferClass) => vt.confirmations >= 0 && vt.confirmations < 3),
    [valueTransfers],
  );

  // A wallet still scanning cannot price a shield, and the refusal it answers
  // with is one of the ordinary ones: no fee, so no button. Nothing about the
  // balance changes when the scan finishes, so the quote has to be asked
  // again on the catching-up itself — without this the button stayed away
  // until the screen was left and re-entered.
  const caughtUp: boolean =
    (syncingStatus.percentage_total_outputs_scanned ?? 0) >= 100 &&
    (syncingStatus.percentage_total_blocks_scanned ?? 0) >= 100;

  const confirmedTransparent: number = totalBalance.confirmedTransparentBalance;
  const worthQuoting: boolean = confirmedTransparent > 0 && !readOnly && !anyPending;

  useEffect(() => {
    if (!worthQuoting) {
      setShieldFee(0);
      return;
    }
    let current = true;
    (async () => {
      const fee: number = await calculateShieldFee();
      if (current) setShieldFee(fee);
    })();
    return () => {
      current = false;
    };
  }, [worthQuoting, confirmedTransparent, caughtUp, calculateShieldFee]);

  const canShield: boolean = worthQuoting && confirmedTransparent >= shieldFee && shieldFee > 0;
  // Transparent funds the wallet will not price right now. Saying nothing here
  // is what made this look like the button had vanished.
  const cannotQuoteYet: boolean = worthQuoting && shieldFee <= 0;

  return (
    <div className={cstyles.balancebox}>
      {canShield && (
        // The row is its own flex box: the container spreads its children to
        // the edges, and the sentence belongs beside the button it explains,
        // not across the pane from it. It claims the whole box so the text has
        // the rest of the row to run in.
        <div style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left", flex: 1 }}>
          <button
            className={cstyles.primarybutton}
            type="button"
            style={{ flexShrink: 0 }}
            disabled={mixnetView.sendBlocked}
            onClick={handleShieldButton}
          >
            Shield Transparent Balance (Fee: {shieldFee})
          </button>
          {/* Two lines beside the button: why it is there, and where what it
              does will travel — the second in the words the Send and Swap
              screens use, because it is the same route and the same wait.
              Both run to the end of the row rather than wrapping inside a
              width picked by hand; `minWidth: 0` is what lets a flex item
              narrow enough to wrap at all. */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
            <div className={`${cstyles.sublight} ${cstyles.small}`}>
              Transparent funds cannot be spent. Shielding moves them into your own shielded balance, not to anyone
              else.
            </div>
            <div className={`${mixnetView.sendBlocked ? cstyles.yellow : cstyles.sublight} ${cstyles.small}`}>
              {describeSendRoute(mixnetView)}
            </div>
          </div>
        </div>
      )}
      {cannotQuoteYet && (
        <div className={`${cstyles.sublight} ${cstyles.small}`} style={{ textAlign: "left" }}>
          Transparent funds cannot be spent, and shielding them is not available right now
          {shieldQuoteReason ? `: ${shieldQuoteReason}` : "."}
        </div>
      )}
      {anyPending && (
        <div className={`${cstyles.red} ${cstyles.small} ${cstyles.padtopsmall}`}>
          Some transactions are pending waiting for the minimum confirmations (3). Balances may change.
        </div>
      )}
    </div>
  );
}
