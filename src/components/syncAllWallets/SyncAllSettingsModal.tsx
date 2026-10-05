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

/** "4:07", from milliseconds. */
const minutesAndSeconds = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

/**
 * When the app will next sync the other wallets by itself, counting down.
 * Only while it is set to: turned off, there is nothing to count to.
 */
const NextRun: React.FC = () => {
  const { autoEnabled, nextAutoRunAt, phase } = useContext(SyncAllContext);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!autoEnabled) return null;
  const text: string =
    phase === "running"
      ? "Syncing now."
      : nextAutoRunAt === null
        ? "Waiting for a wallet to be open."
        : `Next sync in ${minutesAndSeconds(nextAutoRunAt - now)}.`;
  return (
    <div className={cstyles.small} style={{ marginTop: 12 }} data-testid="sync-all-next-run">
      {text}
    </div>
  );
};

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
        {/* What is saved, not what is ticked: the countdown is for the
            schedule that is running, which an unsaved tick has not changed. */}
        <NextRun />
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
