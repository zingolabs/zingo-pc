import React from "react";
import Modal from "react-modal";
import TextareaAutosize from "react-textarea-autosize";
import styles from "../Sidebar.module.css";
import cstyles from "../../common/Common.module.css";


type ExportPrivKeyModalProps = {
  modalIsOpen: boolean;
  exportedPrivKeys: string[];
  closeModal: () => void;
};

const ExportPrivKeyModal = ({ modalIsOpen, exportedPrivKeys, closeModal }: ExportPrivKeyModalProps) => {
  return (
    <Modal
      isOpen={modalIsOpen}
      onRequestClose={closeModal}
      className={cstyles.modal}
      overlayClassName={cstyles.modalOverlay}
    >
      <div className={[cstyles.verticalflex].join(" ")}>
        <div className={cstyles.marginbottomlarge} style={{ textAlign: "center" }}>
          Your Wallet Private Keys
        </div>

        <div className={[cstyles.marginbottomlarge, cstyles.center].join(" ")}>
          These are all the private keys in your wallet. Please store them carefully!
        </div>

        {exportedPrivKeys && (
          <TextareaAutosize value={exportedPrivKeys.join("\n")} className={styles.exportedPrivKeys} disabled />
        )}
      </div>

      <div className={cstyles.buttoncontainer}>
        <button type="button" className={cstyles.primarybutton} onClick={closeModal}>
          Close
        </button>
      </div>
    </Modal>
  );
};

export default ExportPrivKeyModal;