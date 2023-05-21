import React, { useState } from "react";
import Modal from "react-modal";
import TextareaAutosize from "react-textarea-autosize";
import cstyles from "../../common/Common.module.css";

type ImportPrivKeyModalProps = {
  modalIsOpen: boolean;
  closeModal: () => void;
  doImportPrivKeys: (pk: string, birthday: string) => void;
};

const ImportPrivKeyModal = ({ modalIsOpen, closeModal, doImportPrivKeys }: ImportPrivKeyModalProps) => {
  const [pkey, setPKey] = useState("");
  const [birthday, setBirthday] = useState("0");

  const localCloseModal = () => {
    setPKey("");
    setBirthday("0");
    closeModal();
  };

  return (
    <Modal
      isOpen={modalIsOpen}
      onRequestClose={localCloseModal}
      className={cstyles.modal}
      overlayClassName={cstyles.modalOverlay}
    >
      <div className={[cstyles.verticalflex].join(" ")}>
        <div className={cstyles.marginbottomlarge} style={{ textAlign: "center" }}>
          Import Spending or Viewing Key
        </div>

        <div className={cstyles.marginbottomlarge}>
          Please paste your private key here (spending key or viewing key).
        </div>

        <div className={[cstyles.well].join(" ")} style={{ textAlign: "center" }}>
          <TextareaAutosize
            className={cstyles.inputbox}
            placeholder="Spending or Viewing Key"
            value={pkey}
            onChange={(e) => setPKey(e.target.value)}
          />
        </div>

        <div className={cstyles.marginbottomlarge} />
        <div className={cstyles.marginbottomlarge}>
          Birthday (The earliest block height where this key was used. Ok to enter &lsquo;0&rsquo;)
        </div>
        <div className={cstyles.well}>
          <input
            type="number"
            className={cstyles.inputbox}
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
          />
        </div>
      </div>

      <div className={cstyles.buttoncontainer}>
        <button
          type="button"
          className={cstyles.primarybutton}
          onClick={() => {
            doImportPrivKeys(pkey, birthday);
            closeModal();
          }}
        >
          Import
        </button>
        <button type="button" className={cstyles.primarybutton} onClick={localCloseModal}>
          Cancel
        </button>
      </div>
    </Modal>
  );
};

export default ImportPrivKeyModal;