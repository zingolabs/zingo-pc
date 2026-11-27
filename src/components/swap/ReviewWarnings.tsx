import React from "react";
import cstyles from "../common/Common.module.css";
import { NEAR_NO_REFUND_USD } from "../../swap";

type ReviewWarningsProps = {
  /** The NEAR account name to confirm, when the address could be another chain's. */
  nearAccount?: string;
  /** Whether NEAR's no-refunds line applies to this purchase. */
  smallPurchase: boolean;
  onDontShowAgain: (checked: boolean) => void;
};

/** The questions asked before a swap's review, together in one confirm. */
const ReviewWarnings: React.FC<ReviewWarningsProps> = ({ nearAccount, smallPurchase, onDontShowAgain }) => (
  <div style={{ wordBreak: "normal" }}>
    {smallPurchase && (
      <div>
        NEAR doesn’t refund mistakes, like sending the wrong coin or using the wrong network, on swaps under $
        {NEAR_NO_REFUND_USD}. Check every detail before you continue.
      </div>
    )}
    {!!nearAccount && (
      <div className={smallPurchase ? cstyles.margintoplarge : undefined}>
        This is a valid NEAR account name, but addresses from other chains can look like one too, and NEAR does not
        refuse them. Confirm this is a NEAR account: <span style={{ wordBreak: "break-all" }}>{nearAccount}</span>
      </div>
    )}
    {smallPurchase && (
      <label
        className={`${cstyles.horizontalflex} ${cstyles.margintoplarge}`}
        style={{ justifyContent: "center", alignItems: "center", gap: 8, cursor: "pointer" }}
      >
        <input
          type="checkbox"
          data-testid="swap.near-small.dont-show"
          defaultChecked={false}
          onChange={(e) => onDontShowAgain(e.target.checked)}
          style={{ width: 18, height: 18, accentColor: "var(--color-primary)" }}
        />
        Don’t show this again
      </label>
    )}
  </div>
);

export default ReviewWarnings;
