import Modal from "react-modal";
import cstyles from "../../common/Common.module.css";
import { BlockExplorerEnum } from "../../appstate";

type BlockExplorerModalProps = {
  modalIsOpen: boolean;
  modalInput?: BlockExplorerEnum;
  setModalInput: (i: BlockExplorerEnum) => void;
  closeModal: () => void;
  modalTitle: string;
};

const BlockExplorerModal = ({
  modalIsOpen,
  modalInput,
  setModalInput,
  closeModal,
  modalTitle,
}: BlockExplorerModalProps) => {
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

        <div className={cstyles.well} style={{ textAlign: "center" }}>
          <div className={cstyles.horizontalflex} style={{ margin: "10px", alignItems: 'center', flexWrap: 'nowrap' }}>
            <div className={cstyles.sublight}>Select Block Explorer</div>
            <select
              className={cstyles.inputbox}
              style={{width: '80%', marginLeft: "20px" }}
              value={modalInput}
              onChange={(e) => {
                setModalInput(e.target.value as BlockExplorerEnum);
              }}
            >
              <option value="" disabled hidden>Select...</option> 
              <option value={BlockExplorerEnum.Zcashexplorer}>Zcash Explorer App</option>
              <option value={BlockExplorerEnum.Cipherscan}>Cipher Scan App</option> 
              <option value={BlockExplorerEnum.Zypherscan}>Zypher Scan Com</option>
            </select>
          </div>
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

export default BlockExplorerModal;