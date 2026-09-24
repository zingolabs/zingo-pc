import React, { useContext } from "react";

import { ContextApp } from "../../context/ContextAppState";
import { describeSendRoute } from "../../rpc/components/mixnetPresenter";
import cstyles from "../common/Common.module.css";

type ShieldBalanceProps = {
  // Both are per-screen state: each screen recalculates the fee when its own
  // balances move, and decides for itself what counts as pending.
  readonly shieldFee: number;
  readonly anyPending: boolean;
};

/**
 * The Shield Transparent Balance button, with the sentence that says why it is
 * there.
 *
 * The wallet cannot spend transparent funds. `max_send_value` in zingolib
 * starts from `shielded_spendable_balance`, so a wallet holding nothing but
 * transparent coins shows a balance and no spendable funds — and the user is
 * left looking at money the Send screen will not let them move, with no
 * explanation. A button labelled only with its action does not supply one:
 * "shield" is the remedy's name, not the problem's.
 *
 * The sentence also answers the question the button raises. Someone who has
 * just been told their funds are stuck is not obviously reassured by a control
 * that moves them somewhere, so it says where they go: their own balance, not
 * anyone else's.
 *
 * One component rather than the copy this replaced in five screens. The block
 * was already identical in all five; the prose is the part that must not drift
 * between them.
 *
 * Shielding transmits, and it ends in the same route policy a send does, so it
 * waits for the same transport: with the mixnet bootstrapping, lost or
 * unreadable, the wallet core refuses it. The Send and Swap screens have always
 * said so and held their buttons back; this one let the user press it and meet
 * the refusal as an error, which reads like a fault in the shield rather than a
 * transport that is not up yet.
 */
export function ShieldBalance({ shieldFee, anyPending }: ShieldBalanceProps) {
  const { totalBalance, readOnly, handleShieldButton, mixnetView } = useContext(ContextApp);

  const canShield: boolean =
    totalBalance.confirmedTransparentBalance >= shieldFee && shieldFee > 0 && !readOnly && !anyPending;

  return (
    <div className={cstyles.balancebox}>
      {canShield && (
        // The row is its own flex box: the container spreads its children to
        // the edges, and the sentence belongs beside the button it explains,
        // not across the pane from it.
        <div style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left" }}>
          <button
            className={cstyles.primarybutton}
            type="button"
            disabled={mixnetView.sendBlocked}
            onClick={handleShieldButton}
          >
            Shield Transparent Balance (Fee: {shieldFee})
          </button>
          <div className={`${cstyles.sublight} ${cstyles.small}`} style={{ maxWidth: 420 }}>
            Transparent funds cannot be spent. Shielding moves them into your own shielded balance, where they can be
            spent — it does not send them to anyone.
          </div>
        </div>
      )}
      {/* Only when it blocks. The Send screen names the route in every state,
          because that is the screen where the route is worth teaching; here the
          line exists to say why a button went grey, and this block appears on
          five screens. */}
      {canShield && mixnetView.sendBlocked && (
        <div className={`${cstyles.yellow} ${cstyles.small} ${cstyles.padtopsmall}`}>
          {describeSendRoute(mixnetView, "shield")}
        </div>
      )}
      {!!anyPending && (
        <div className={`${cstyles.red} ${cstyles.small} ${cstyles.padtopsmall}`}>
          Some transactions are pending waiting for the minimum confirmations (3). Balances may change.
        </div>
      )}
    </div>
  );
}
