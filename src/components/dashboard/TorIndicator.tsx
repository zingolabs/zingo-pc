import React from "react";

import torOnion from "../../assets/img/tor-onion.svg";

type Props = {
  /** User preference: should the price be fetched via Tor? */
  intent: boolean;
  /**
   * Reality of the last price fetch:
   *   null  → no fetch attempted yet with the current intent (don't render)
   *   true  → last fetch went via Tor
   *   false → last fetch went over the HTTPS API (Tor failed or not requested)
   */
  reality: boolean | null;
  /** Optional size in px (default 16). */
  size?: number;
};

/**
 * Small Tor onion next to the USD price on the dashboard. Three visual states:
 *
 *   intent=false, reality=*       → not rendered (no indicator at all)
 *   intent=true,  reality=true    → solid onion, tooltip "Price fetched via Tor"
 *   intent=true,  reality=false   → onion at reduced opacity with red dot,
 *                                   tooltip "Tor configured but failed — fell back to HTTP"
 *
 * The intent is read by the parent from settings; reality is the
 * `lastPriceViaTor` field set by RPC.getZecPrice() on each successful fetch.
 */
const TorIndicator: React.FC<Props> = ({ intent, reality, size = 16 }) => {
  if (!intent) return null;
  // Pending: setting was just toggled (or app just booted) and we haven't
  // completed a price fetch yet. Skip the indicator entirely until reality
  // resolves — otherwise the user sees a brief red-dot "Tor failed" that's
  // actually just "Tor hasn't been tried yet".
  if (reality === null) return null;

  const succeeded = reality;
  const tooltip = succeeded ? "Price fetched via Tor" : "Tor configured but failed — fell back to the HTTPS API";

  return (
    <span
      title={tooltip}
      style={{
        display: "inline-flex",
        position: "relative",
        verticalAlign: "middle",
      }}
    >
      <img src={torOnion} alt="Tor" width={size} height={size} style={{ opacity: succeeded ? 1 : 0.45 }} />
      {!succeeded && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            right: -2,
            top: -2,
            width: 6,
            height: 6,
            borderRadius: "50%",
            backgroundColor: "#E04545",
            boxShadow: "0 0 0 1px #000",
          }}
        />
      )}
    </span>
  );
};

export default TorIndicator;
