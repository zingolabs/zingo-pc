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
      <div className={cstyles.verticalflex}>
        {/* Room under it: the dark box starts right where the title ends, and
            the two read as one block without it. */}
        <div className={cstyles.padtopsmall} style={{ textAlign: "center", marginBottom: 12 }}>
          {modalTitle}
        </div>

        {readOnly && (
          <div className={cstyles.well} style={{ textAlign: "center" }}>
            This is a only-watch wallet, it is imposible to spend/send the balance.
          </div>
        )}

        {/* A title, a field and two buttons said nothing about what goes in the
            field or what happens next. Both matter here: what a request
            carries is what the form will be filled with, and nothing is sent
            until it is reviewed. The explanation sits under the field, inside
            the same box, so it reads as belonging to it rather than as a
            second heading above it. */}
        {!readOnly && (
          <div className={cstyles.well}>
            <div className={cstyles.sublight}>URI</div>
            <div className={cstyles.fieldrow}>
              <input
                type="text"
                // The label above is a sibling, not a `<label for>`.
                aria-label="Payment URI"
                className={cstyles.fieldinput}
                placeholder="zcash:--------?amount=---"
                value={modalInput}
                onChange={(e) => setModalInput(e.target.value)}
              />
            </div>

            <div style={{ marginTop: 12 }}>
              Paste a payment request — a <span className={cstyles.fixedfont}>zcash:</span> link — or a plain Zcash
              address.
            </div>
            <div style={{ marginTop: 8 }}>
              Whatever it carries fills the Send form: the address, and the amount, memo and recipients when the request
              names them. Nothing leaves the wallet until you review it there. Links opened from a browser, a PDF or a
              message come here on their own, and Send reads the same request from a QR code.
            </div>
          </div>
        )}
      </div>

      <div className={cstyles.buttoncontainer}>
        <button type="button" className={cstyles.primarybutton} onClick={closeModal}>
          Cancel
        </button>

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
      </div>
    </Modal>
  );
};

export default PayURIModal;
