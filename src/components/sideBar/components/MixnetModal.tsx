import Modal from "react-modal";
import { useContext, useState } from "react";
import cstyles from "../../common/Common.module.css";
import { ContextApp } from "../../../context/ContextAppState";
import RPC from "../../../rpc/rpc";

type MixnetModalProps = {
  modalIsOpen: boolean;
  closeModal: () => void;
};

const STATUS_TEXT: Record<string, string> = {
  "mixnet.status.ready": "Ready",
  "mixnet.status.bootstrapping": "Connecting",
  "mixnet.status.off": "Off (clearnet)",
  "mixnet.status.unattached": "Not connected",
  "mixnet.status.died": "Disconnected",
  "mixnet.status.unknown": "Unknown",
};

const MixnetModal = ({ modalIsOpen, closeModal }: MixnetModalProps) => {
  const { mixnetView } = useContext(ContextApp);
  const [busy, setBusy] = useState<boolean>(false);

  // Enabled is every state except the deliberate per-session opt-out.
  const enabled = mixnetView.statusKey !== "mixnet.status.off";

  const toggle = async () => {
    setBusy(true);
    try {
      if (enabled) {
        await RPC.stopMixnet();
      } else {
        await RPC.startMixnet();
      }
    } catch {
      // The status poll republishes the outcome; the modal reflects it on the
      // next cycle. A failed enable stays fail-closed.
    } finally {
      setBusy(false);
    }
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
      <div className={`${cstyles.xlarge} ${cstyles.center}`}>Nym Mixnet</div>

      <div className={cstyles.well} style={{ marginTop: 24 }}>
        <div className={cstyles.flexspacebetween}>
          <span>Status</span>
          <span>{STATUS_TEXT[mixnetView.statusKey] ?? "Unknown"}</span>
        </div>
        {mixnetView.socks5Addr && (
          <div className={cstyles.flexspacebetween} style={{ marginTop: 8 }}>
            <span>Tunnel</span>
            <span className={cstyles.small}>{mixnetView.socks5Addr}</span>
          </div>
        )}
        {mixnetView.narration && (
          <div className={cstyles.small} style={{ opacity: 0.6, marginTop: 8 }}>
            {mixnetView.narration}
          </div>
        )}
      </div>

      <div className={cstyles.well} style={{ marginTop: 16 }}>
        <div className={cstyles.small} style={{ opacity: 0.6 }}>
          The mixnet hides your IP from the indexer when you send. Disabling it routes this session over clearnet:
          faster, but the indexer sees your IP. The choice is never saved; the mixnet re-enables on the next launch.
        </div>
      </div>

      <div className={cstyles.buttoncontainer} style={{ marginTop: 24 }}>
        <button type="button" className={cstyles.primarybutton} onClick={toggle} disabled={busy}>
          {enabled ? "Disable (use clearnet)" : "Enable mixnet"}
        </button>
        <button type="button" className={cstyles.primarybutton} onClick={closeModal}>
          Close
        </button>
      </div>
    </Modal>
  );
};

export default MixnetModal;
