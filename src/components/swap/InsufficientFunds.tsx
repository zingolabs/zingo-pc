import React from "react";
import Modal from "react-modal";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWallet } from "@fortawesome/free-solid-svg-icons";

import styles from "../history/History.module.css";
import cstyles from "../common/Common.module.css";
import Utils from "../../utils/utils";

/**
 * Down to the zatoshi, dropping anything finer. `toFixed` would round up and
 * name a figure the wallet does not hold.
 */
function truncateToZatoshis(amount: number): string {
  return (Math.floor(amount * 1e8) / 1e8).toFixed(8);
}

type InsufficientFundsProps = {
  /** Shielded balance the wallet can spend, in ZEC display units. */
  spendable: number;
  /**
   * Balance minus what the live route charges on the sell side and minus the
   * reserve for the deposit's own Zcash network fee — the largest amount that
   * can actually be swapped. Falls back to the balance when no quote has
   * landed yet and neither figure is known.
   */
  maxSpendableForSwap: number;
  modalIsOpen: boolean;
  closeModal: () => void;
  onReduce: (amount: string) => void;
};

/**
 * Shown when the amount asked for is more than the wallet can spend.
 *
 * It offers the way out rather than only naming the problem: reducing to the
 * largest swappable amount is the action the user would otherwise perform by
 * hand. Offering the bare balance instead would walk them into the same
 * refusal, since the route's fees come out of that same balance.
 *
 * Truncated rather than rounded, to 8 decimals: rounding up would name a
 * figure a hair above what the wallet holds.
 */
const InsufficientFunds: React.FC<InsufficientFundsProps> = ({
  spendable,
  maxSpendableForSwap,
  modalIsOpen,
  closeModal,
  onReduce,
}) => (
  <Modal
    isOpen={modalIsOpen}
    onRequestClose={closeModal}
    className={styles.txmodal}
    overlayClassName={styles.txmodalOverlay}
  >
    <div className={cstyles.verticalflex} style={{ height: "100%" }}>
      <div
        className={`${cstyles.center} ${cstyles.padtopsmall}`}
        style={{ color: Utils.getCssVariable("--color-warning") }}
      >
        <FontAwesomeIcon icon={faWallet} size="3x" />
      </div>

      <div className={`${cstyles.center} ${cstyles.xlarge} ${cstyles.padtopsmall}`}>Insufficient funds</div>

      <div className={`${cstyles.center} ${cstyles.padtopsmall}`}>
        Your spendable ZEC does not cover this amount plus the network fee. Lower the amount, or add more ZEC to the
        wallet, and try again.
      </div>

      {maxSpendableForSwap > 0 && (
        <div className={`${cstyles.center} ${cstyles.padtopsmall}`}>
          <button
            type="button"
            className={cstyles.primarybutton}
            onClick={() => {
              onReduce(truncateToZatoshis(maxSpendableForSwap));
              closeModal();
            }}
          >
            Reduce to {truncateToZatoshis(maxSpendableForSwap)} ZEC
          </button>
          <div className={`${cstyles.sublight} ${cstyles.small} ${cstyles.padtopsmall}`}>
            {maxSpendableForSwap < spendable
              ? "That is the spendable balance less this route's fees and the deposit's network fee."
              : "That is the whole spendable balance. Fees come out of it, so the swap may still need a little less."}
          </div>
        </div>
      )}

      <div style={{ flexGrow: 1 }} />

      <div className={`${cstyles.center} ${cstyles.margintoplarge}`}>
        <button type="button" className={cstyles.primarybutton} onClick={closeModal}>
          Cancel
        </button>
      </div>
    </div>
  </Modal>
);

export default InsufficientFunds;
