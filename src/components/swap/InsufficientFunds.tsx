import React from "react";
import Modal from "react-modal";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWallet, faXmark } from "@fortawesome/free-solid-svg-icons";

import styles from "../history/History.module.css";
import cstyles from "../common/Common.module.css";
import Utils from "../../utils/utils";

type InsufficientFundsProps = {
  /** Shielded balance the wallet can spend, in ZEC display units. */
  spendable: number;
  modalIsOpen: boolean;
  closeModal: () => void;
  onReduce: (amount: string) => void;
};

/**
 * Shown when the amount asked for is more than the wallet can spend.
 *
 * It offers the way out rather than only naming the problem: reducing to the
 * spendable balance is the action the user would otherwise perform by hand.
 *
 * That figure is the balance, not a quotable maximum. The network fee still
 * comes out of it, so a swap of exactly this much can still be refused for
 * being a few thousand zatoshis short. The copy says so instead of presenting
 * it as a guaranteed fit.
 */
const InsufficientFunds: React.FC<InsufficientFundsProps> = ({ spendable, modalIsOpen, closeModal, onReduce }) => (
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

      {spendable > 0 && (
        <div className={`${cstyles.center} ${cstyles.padtopsmall}`}>
          <button
            type="button"
            className={cstyles.primarybutton}
            onClick={() => {
              onReduce(spendable.toFixed(8));
              closeModal();
            }}
          >
            Reduce to {spendable.toFixed(8)} ZEC
          </button>
          <div className={`${cstyles.sublight} ${cstyles.small} ${cstyles.padtopsmall}`}>
            That is the whole spendable balance. The fee comes out of it, so the swap may still need a little less.
          </div>
        </div>
      )}

      <div style={{ flexGrow: 1 }} />

      <div className={`${cstyles.center} ${cstyles.padtopsmall}`}>
        <button type="button" className={cstyles.primarybutton} onClick={closeModal}>
          Close &nbsp;
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>
    </div>
  </Modal>
);

export default InsufficientFunds;
