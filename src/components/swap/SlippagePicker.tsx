import React, { useState } from "react";
import Modal from "react-modal";

import styles from "../history/History.module.css";
import swapStyles from "./Swap.module.css";
import cstyles from "../common/Common.module.css";
import Utils from "../../utils/utils";

/** 0.5%, 1%, 2%, 3%. */
const PRESETS_BPS: ReadonlyArray<number> = [50, 100, 200, 300];

/** Past this, the tolerance stops protecting and starts inviting a bad fill. */
const WARNING_THRESHOLD_BPS = 5_000;

/** 100%. A tolerance above this means nothing. */
const MAX_BPS = 10_000;

type SlippagePickerProps = {
  slippageBps: number;
  modalIsOpen: boolean;
  closeModal: () => void;
  onChange: (bps: number) => void;
};

export function formatSlippagePercent(bps: number): string {
  return (bps / 100).toFixed(bps % 100 === 0 ? 0 : 1);
}

/**
 * The slippage tolerance, in basis points.
 *
 * It sets the floor the swap guarantees: the provider may fill anywhere
 * between the quote and that floor, and refuses rather than fill below it.
 * Raising it keeps a route alive through a volatile minute; lowering it
 * refuses a bad fill and costs the swap instead. Neither is the safe choice in
 * general, which is why it is the user's.
 */
const SlippagePicker: React.FC<SlippagePickerProps> = ({ slippageBps, modalIsOpen, closeModal, onChange }) => {
  const [custom, setCustom] = useState<string>("");

  const applyCustom = () => {
    const parsed = parseFloat(custom.replace(",", "."));
    if (!Number.isFinite(parsed)) return;
    const bps = Math.round(parsed * 100);
    // Zero would guarantee the quote exactly, which no route can promise, and
    // above 100% the number has stopped meaning anything.
    if (bps <= 0 || bps > MAX_BPS) return;
    onChange(bps);
    closeModal();
  };

  return (
    <Modal
      isOpen={modalIsOpen}
      onRequestClose={closeModal}
      className={styles.txmodal}
      overlayClassName={styles.txmodalOverlay}
    >
      <div className={cstyles.verticalflex} style={{ height: "100%" }}>
        <div className={`${cstyles.center} ${cstyles.xlarge} ${cstyles.padtopsmall}`}>Slippage tolerance</div>

        <div className={`${cstyles.sublight} ${cstyles.small} ${cstyles.padtopsmall}`}>
          How far below the quote a fill may land before the provider refuses it instead.
        </div>

        <div className={`${cstyles.horizontalflex} ${cstyles.padtopsmall}`} style={{ gap: 8, flexWrap: "wrap" }}>
          {PRESETS_BPS.map((bps) => (
            <button
              key={bps}
              type="button"
              className={cstyles.primarybutton}
              style={{ opacity: bps === slippageBps ? 1 : 0.6 }}
              onClick={() => {
                onChange(bps);
                closeModal();
              }}
            >
              {formatSlippagePercent(bps)}%
            </button>
          ))}
        </div>

        <div className={cstyles.padtopsmall}>
          <div className={`${cstyles.sublight} ${cstyles.small}`}>Custom (%)</div>
          <div className={cstyles.horizontalflex} style={{ gap: 8, alignItems: "center" }}>
            <div className={swapStyles.fieldrow} style={{ width: 100 }}>
              <input
                className={swapStyles.fieldinput}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyCustom();
                }}
                placeholder={formatSlippagePercent(slippageBps)}
                inputMode="decimal"
              />
            </div>
            <button type="button" className={cstyles.primarybutton} onClick={applyCustom}>
              Apply
            </button>
          </div>
        </div>

        {Math.round(parseFloat(custom.replace(",", ".")) * 100) > WARNING_THRESHOLD_BPS && (
          <div
            className={`${cstyles.padtopsmall} ${cstyles.small}`}
            style={{ color: Utils.getCssVariable("--color-warning") }}
          >
            Above {formatSlippagePercent(WARNING_THRESHOLD_BPS)}% the tolerance no longer protects you. A route could
            fill at a fraction of the quote and still be accepted.
          </div>
        )}

        <div style={{ flexGrow: 1 }} />

        <div className={`${cstyles.center} ${cstyles.padtopsmall}`}>
          <button type="button" className={cstyles.primarybutton} onClick={closeModal}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default SlippagePicker;
