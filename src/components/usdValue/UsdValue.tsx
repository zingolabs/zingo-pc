import React from "react";
import Utils from "../../utils/utils";

type Props = {
  /** Current USD price per ZEC. Falsy / 0 renders the unified `USD --` fallback. */
  price?: number;
  /**
   * If provided, renders the total value `price * amount`. If absent, renders
   * the per-ZEC rate (`USD x.xx / ZEC`). Both modes share the same `USD --`
   * fallback when the price is unavailable.
   */
  amount?: number;
  /** Optional className passed through to the wrapper span. */
  className?: string;
  /** Optional inline style passed through to the wrapper span. */
  style?: React.CSSProperties;
};

/**
 * Single place that turns a ZEC price (and optionally an amount) into the
 * USD string the UI shows. Two call shapes:
 *
 *   <UsdValue price={zecPrice} amount={someZecAmount} />  // total value
 *   <UsdValue price={zecPrice} />                          // rate per ZEC
 *
 * Both fall back to `USD --` when `price` is 0/undefined. The total form
 * additionally renders `USD < 0.01` for sub-cent values. Centralising the
 * fallback here keeps the UI consistent — there are no longer mixed
 * variants like `USD -- / ZEC` floating around.
 */
const UsdValue: React.FC<Props> = ({ price, amount, className, style }) => {
  const text = amount === undefined ? Utils.getZecRateString(price) : Utils.getZecToUsdString(price, amount);
  return (
    <span className={className} style={style}>
      {text}
    </span>
  );
};

export default UsdValue;
