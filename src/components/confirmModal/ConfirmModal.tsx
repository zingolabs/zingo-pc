import Modal from "react-modal";
import cstyles from "../common/Common.module.css";
import { useContext } from "react";
import { ContextApp } from "../../context/ContextAppState";

type ConfirmModalProps = {
  closeModal: () => void;
};

const ConfirmModal: React.FC<ConfirmModalProps> = ({ closeModal }) => {
  const context = useContext(ContextApp);
  const { confirmModal } = context;
  const { title, body, modalIsOpen, runAction, alternate } = confirmModal;

  return (
    <Modal
      isOpen={modalIsOpen}
      onRequestClose={closeModal}
      className={cstyles.modal}
      overlayClassName={cstyles.modalOverlay}
    >
      <div className={cstyles.verticalflex}>
        <div className={cstyles.marginbottomlarge} style={{ textAlign: "center" }}>
          {title}
        </div>

        <div
          className={cstyles.well}
          style={{ textAlign: "center", wordBreak: "break-all", maxHeight: "400px", overflowY: "auto" }}
        >
          {body}
        </div>
      </div>

      <div className={cstyles.verticalflex} style={{ justifyContent: "center", alignItems: "center" }}>
        <div className={cstyles.horizontalflex}>
          <div className={cstyles.buttoncontainer}>
            <button type="button" className={cstyles.primarybutton} onClick={closeModal}>
              Cancel
            </button>
          </div>
          {/* Between the two, so Cancel stays where the eye looks for it and
              Confirm keeps the end of the row. It closes the dialog like the
              others: whatever it opens takes over from here. */}
          {alternate && (
            <div className={cstyles.buttoncontainer}>
              <button
                type="button"
                className={cstyles.primarybutton}
                onClick={() => {
                  alternate.action();
                  closeModal();
                }}
              >
                {alternate.label}
              </button>
            </div>
          )}
          <div className={cstyles.buttoncontainer}>
            <button
              type="button"
              className={cstyles.primarybutton}
              onClick={() => {
                runAction();
                closeModal();
              }}
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default ConfirmModal;
