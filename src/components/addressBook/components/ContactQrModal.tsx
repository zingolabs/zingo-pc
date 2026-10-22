import React from "react";
import Modal from "react-modal";
import { QRCodeCanvas } from "qrcode.react";
import cstyles from "../../common/Common.module.css";
import swapStyles from "../../swap/Swap.module.css";
import Utils from "../../../utils/utils";
import { ChainBadge } from "../../common/ChainBadge";

type ContactQrModalProps = {
  label: string;
  /** The address the code carries, as saved: what another device scans. */
  address: string;
  /** The contact's chain code, for the badge. */
  swapChain: string;
  /** The chain in words, under the name. */
  chainLabel: string;
  modalIsOpen: boolean;
  closeModal: () => void;
};

/**
 * A contact's address as a QR code, so another device (a phone) can scan it.
 * The address is written out in full under the code, to be checked by eye
 * against what the other device reads.
 */
const ContactQrModal: React.FC<ContactQrModalProps> = ({
  label,
  address,
  swapChain,
  chainLabel,
  modalIsOpen,
  closeModal,
}) => (
  <Modal
    isOpen={modalIsOpen}
    onRequestClose={closeModal}
    className={swapStyles.narrowmodal}
    overlayClassName={cstyles.modalOverlay}
  >
    <div className={cstyles.verticalflex} style={{ alignItems: "center" }}>
      <div
        className={`${cstyles.xlarge} ${cstyles.padtopsmall}`}
        style={{ display: "flex", alignItems: "center", gap: 10 }}
      >
        <ChainBadge chain={swapChain} size={24} />
        {label}
      </div>
      <div className={`${cstyles.small} ${cstyles.sublight}`}>{chainLabel}</div>

      <div className={cstyles.margintoplarge} style={{ background: "#fff", padding: 8, borderRadius: 8 }}>
        <QRCodeCanvas value={address} size={260} marginSize={2} aria-label={`QR code of ${label}'s address`} />
      </div>

      <div
        className={`${cstyles.small} ${cstyles.margintoplarge}`}
        style={{ textAlign: "center", wordBreak: "break-all" }}
      >
        {address.length < 80
          ? address
          : Utils.splitStringIntoChunks(address, 3).map((chunk) => <div key={chunk}>{chunk}</div>)}
      </div>

      <div className={`${cstyles.buttoncontainer} ${cstyles.margintoplarge}`}>
        <button type="button" className={cstyles.primarybutton} onClick={closeModal}>
          Close
        </button>
      </div>
    </div>
  </Modal>
);

export default ContactQrModal;
