import Modal from "react-modal";
import { useContext, useEffect, useState } from "react";
import cstyles from "../../common/Common.module.css";
import { ContextApp } from "../../../context/ContextAppState";
import torOnion from "../../../assets/img/tor-onion.svg";

type PriceTorModalProps = {
  modalIsOpen: boolean;
  closeModal: () => void;
  modalTitle: string;
};

const PriceTorModal = ({ modalIsOpen, closeModal, modalTitle }: PriceTorModalProps) => {
  const { priceWithTor, setPriceWithTor } = useContext(ContextApp);

  // Local draft state — lets the user toggle radios without committing until
  // they press Save. Re-synced with the context value every time the modal
  // opens, so reopening doesn't leak the previous session's draft.
  const [draft, setDraft] = useState<boolean>(priceWithTor);
  useEffect(() => {
    if (modalIsOpen) setDraft(priceWithTor);
  }, [modalIsOpen, priceWithTor]);

  const handleCancel = () => {
    setDraft(priceWithTor);
    closeModal();
  };

  const handleSave = () => {
    setPriceWithTor(draft);
    closeModal();
  };

  return (
    <Modal
      isOpen={modalIsOpen}
      onRequestClose={closeModal}
      className={cstyles.modalOverlay}
      overlayClassName={cstyles.modalOverlay}
      style={{
        content: {
          background: "var(--bg-color, #1a1a2e)",
          border: "1px solid #444",
          borderRadius: 8,
          padding: 32,
          maxWidth: 520,
          margin: "auto",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          position: "absolute",
          right: "auto",
          bottom: "auto",
        },
      }}
    >
      <div
        className={`${cstyles.xlarge} ${cstyles.center}`}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}
      >
        <img src={torOnion} alt="Tor" width={24} height={24} />
        {modalTitle}
      </div>

      <div className={`${cstyles.well} ${cstyles.margintopsmall}`} style={{ marginTop: 24 }}>
        <div className={cstyles.small} style={{ opacity: 0.7, marginBottom: 16 }}>
          Choose how to fetch the ZEC price. Tor adds latency but hides the price-fetch request from your network
          observer. The conventional path uses a plain HTTPS API.
        </div>

        <label
          htmlFor="price-tor-off"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            cursor: "pointer",
          }}
        >
          <input id="price-tor-off" type="radio" name="pricetor" checked={!draft} onChange={() => setDraft(false)} />
          <span>Conventional (HTTPS API)</span>
        </label>

        <label
          htmlFor="price-tor-on"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            cursor: "pointer",
          }}
        >
          <input id="price-tor-on" type="radio" name="pricetor" checked={draft} onChange={() => setDraft(true)} />
          <img src={torOnion} alt="" width={18} height={18} />
          <span>Through Tor</span>
        </label>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 24 }}>
        <button type="button" className={cstyles.primarybutton} onClick={handleCancel}>
          Cancel
        </button>
        <button type="button" className={cstyles.primarybutton} onClick={handleSave}>
          Save
        </button>
      </div>
    </Modal>
  );
};

export default PriceTorModal;
