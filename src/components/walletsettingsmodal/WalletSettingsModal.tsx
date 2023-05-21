import Modal from "react-modal";
import React, { useEffect, useState } from "react";
import cstyles from "../common/Common.module.css";
import { WalletSettings } from "../appstate";

type WalletSettingsModalProps = {
  walletSettings: WalletSettings;
  modalIsOpen: boolean;
  closeModal: () => void;
  setWalletSpamFilterThreshold: (threshold: number) => void;
};

export default function WalletSettingsModal({
  walletSettings,
  modalIsOpen,
  closeModal,
  setWalletSpamFilterThreshold,
}: WalletSettingsModalProps) {
  const [selected, setSelected] = useState(""); 

  const initialValue = (tft: number) => {
    if (tft <= 0) {
      setSelected("no_filter");
    } else {
      setSelected("filter"); 
    }
  };

  useEffect(() => {
    initialValue(walletSettings.transaction_filter_threshold);
  }, [walletSettings.transaction_filter_threshold]);

  const localCloseModal = () => {
    initialValue(walletSettings.transaction_filter_threshold);
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
        <div className={cstyles.marginbottomlarge} style={{ textAlign: "left", marginLeft: 10 }}>
          Transaction Filter Threshold
        </div>

        <div className={[cstyles.well, cstyles.verticalflex].join(" ")}>
          <div style={{ margin: "10px" }}>
            <input
              type="radio"
              name="filter"
              defaultChecked={selected === "filter"}
              value="filter"
              onClick={(e) => setSelected("filter")}
            />
            Don't scan spammy transactions (value: 500)
          </div>

          <div style={{ margin: "10px" }}>
            <input
              type="radio"
              name="filter"
              value="no_filter"
              defaultChecked={selected === "no_filter"}
              onClick={(e) => setSelected("no_filter")}
            />
            Scan all transactions (value: 0)
          </div>
        </div>

        <div className={cstyles.buttoncontainer}>
          <button type="button" className={cstyles.primarybutton} onClick={() => {
            if (selected === "filter") {
              setWalletSpamFilterThreshold(500);
            } else {
              setWalletSpamFilterThreshold(0);
            }
            localCloseModal(); 
          }}>
            Save
          </button>
          <button type="button" className={cstyles.primarybutton} onClick={localCloseModal}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
