import React, { useContext, useEffect, useState } from "react";
import Modal from "react-modal";
import cstyles from "../common/Common.module.css";
import { SyncAllContext } from "../../syncAll";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export const AUTO_SYNC_LABEL = "Sync all wallets automatically";
export const AUTO_SYNC_EXPLANATION =
  "When the app starts, and every 15 minutes after that. Turned off, the other wallets are only synced when you ask, from the Wallet menu.";

/**
 * Whether the app syncs the other wallets by itself. One setting, in the
 * shape of App Security: a line, what it means, and a box to tick.
 */
const SyncAllSettingsModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { autoEnabled, setAutoEnabled } = useContext(SyncAllContext);
  const [chosen, setChosen] = useState<boolean>(autoEnabled);

  // Opened on what is saved, whatever was left unsaved the last time.
  useEffect(() => {
    if (isOpen) setChosen(autoEnabled);
  }, [isOpen, autoEnabled]);

  const save = () => {
    setAutoEnabled(chosen);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      className={cstyles.centredsheet}
      overlayClassName={cstyles.modalOverlay}
      style={{ content: { maxWidth: 440 } }}
    >
      <div className={`${cstyles.xlarge} ${cstyles.center}`}>Background Sync</div>

      <div className={cstyles.well} style={{ marginTop: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div className={cstyles.small}>{AUTO_SYNC_LABEL}</div>
            <div className={cstyles.small} style={{ opacity: 0.6, marginTop: 4 }}>
              {AUTO_SYNC_EXPLANATION}
            </div>
          </div>
          <label style={{ display: "contents" }}>
            <input
              type="checkbox"
              aria-label={AUTO_SYNC_LABEL}
              checked={chosen}
              onChange={(e) => setChosen(e.target.checked)}
              style={{
                width: 18,
                height: 18,
                marginLeft: 16,
                cursor: "pointer",
                accentColor: "var(--color-primary)",
                flexShrink: 0,
              }}
            />
          </label>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 24 }}>
        <button type="button" className={cstyles.primarybutton} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={cstyles.primarybutton} onClick={save} disabled={chosen === autoEnabled}>
          Save
        </button>
      </div>
    </Modal>
  );
};

export default SyncAllSettingsModal;
