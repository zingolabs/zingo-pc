import React, { useContext } from "react";
import Modal from "react-modal";
import cstyles from "../../common/Common.module.css";
import { ContextApp } from "../../../context/ContextAppState";

type PayURIModalProps = {
  modalIsOpen: boolean;
  modalInput?: string;
  setModalInput: (i: string) => void;
  closeModal: () => void;
  modalTitle: string;
  actionButtonName: string;
  actionCallback: (uri: string) => void;
};

const PayURIModal = ({
  modalIsOpen,
  modalInput,
  setModalInput,
  closeModal,
  modalTitle,
  actionButtonName,
  actionCallback,
}: PayURIModalProps) => {
  const context = useContext(ContextApp);
  const { readOnly } = context; 
  return (
    <Modal
      isOpen={modalIsOpen}
      onRequestClose={closeModal}
      className={cstyles.modal}
      overlayClassName={cstyles.modalOverlay}
    >
      <div className={[cstyles.verticalflex].join(" ")}>
        <div className={cstyles.marginbottomlarge} style={{ textAlign: "center" }}>
          {modalTitle}
        </div>

        {readOnly && (
          <div className={cstyles.well} style={{ textAlign: "center" }}>This is a only-watch wallet, it is imposible to spend/send the balance.</div>  
        )}
        {!readOnly && (
          <div className={cstyles.well} style={{ textAlign: "center" }}>
            <input
              type="text"
              className={cstyles.inputbox}
              placeholder="URI"
              value={modalInput}
              onChange={(e) => setModalInput(e.target.value)}
            />
          </div>
        )}
      </div>

      <div className={cstyles.buttoncontainer}>
        {actionButtonName && !readOnly && (
          <button
            type="button" 
            disabled={!modalInput}
            className={cstyles.primarybutton}
            onClick={() => {
              if (modalInput) {
                actionCallback(modalInput);
              }
              closeModal();
            }}
          >
            {actionButtonName}
          </button>
        )}

        <button type="button" className={cstyles.primarybutton} onClick={closeModal}>
          Close
        </button>
      </div>
    </Modal>
  );
};

export default PayURIModal;