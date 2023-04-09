import Modal from "react-modal";
import cstyles from "../common/Common.module.css";
import { useContext } from "react";
import { ContextApp } from "../../context/ContextAppState";

type ErrorModalProps = {
  closeModal: () => void
};

const ErrorModal = ({ closeModal }: ErrorModalProps) => {
  const context = useContext(ContextApp);
  const { errorModalData } = context;
  const { title, body, modalIsOpen } = errorModalData;
  return (
    <Modal
      isOpen={modalIsOpen}
      onRequestClose={closeModal}
      className={cstyles.modal}
      overlayClassName={cstyles.modalOverlay}
    >
      <div className={[cstyles.verticalflex].join(" ")}>
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

      <div className={cstyles.buttoncontainer}>
        <button type="button" className={cstyles.primarybutton} onClick={closeModal}>
          Close
        </button>
      </div>
    </Modal>
  );
};

export default ErrorModal;