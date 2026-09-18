import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faExchangeAlt } from "@fortawesome/free-solid-svg-icons";

import cstyles from "./Common.module.css";
import type { UsdAmount } from "./useUsdAmount";

/**
 * The switch inside a ZEC amount field that makes it take dollars, or ZEC
 * again. It names the currency being typed, so the field never leaves the
 * user guessing which one the number is in. Disabled without a price.
 */
const AmountCurrencyToggle: React.FC<{ amount: UsdAmount; currencyName: string }> = ({ amount, currencyName }) => {
  const unit = amount.usdMode ? "USD" : currencyName;
  const title = !amount.canUseUsd
    ? "Typing the amount in USD needs the current price"
    : amount.usdMode
      ? `Type the amount in ${currencyName}`
      : "Type the amount in USD";
  return (
    <button
      type="button"
      className={cstyles.fieldaction}
      aria-label={title}
      title={title}
      disabled={!amount.canUseUsd && !amount.usdMode}
      onClick={amount.toggle}
      style={{ fontWeight: 700, whiteSpace: "nowrap", opacity: amount.canUseUsd || amount.usdMode ? 1 : 0.4 }}
    >
      {unit} <FontAwesomeIcon icon={faExchangeAlt} />
    </button>
  );
};

export default AmountCurrencyToggle;
