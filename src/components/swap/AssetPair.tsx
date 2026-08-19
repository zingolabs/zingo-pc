import React from "react";

import styles from "./AssetCard.module.css";
import AssetCard, { AssetCardProps } from "./AssetCard";
import { SwapFilledIcon } from "./SwapFilledIcon";

/**
 * The two sides of the swap with the direction toggle between them.
 *
 * Which card is ZEC is the direction, so flipping swaps their places and the
 * control reads as what it does. The button straddles the seam between the
 * cards, as it does on mobile — there across the horizontal seam of a vertical
 * stack, here across the vertical seam of a side-by-side pair.
 */
type AssetPairProps = {
  source: AssetCardProps;
  destination: AssetCardProps;
  onToggleDirection: () => void;
};

const AssetPair: React.FC<AssetPairProps> = ({ source, destination, onToggleDirection }) => (
  <div className={styles.pair}>
    <AssetCard {...source} />

    <div className={styles.togglewrap}>
      <button
        type="button"
        className={styles.togglebtn}
        onClick={onToggleDirection}
        aria-label="Flip swap direction"
        title="Flip swap direction"
      >
        {/* Not rotated: mobile turns the glyph 90 deg to match its vertical
            stack, and these arrows already point the way this pair runs. */}
        <SwapFilledIcon size={20} color="currentColor" />
      </button>
    </div>

    <AssetCard {...destination} />
  </div>
);

export default AssetPair;
