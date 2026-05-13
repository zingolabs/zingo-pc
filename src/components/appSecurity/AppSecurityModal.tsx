import React, { useEffect, useState } from "react";
import Modal from "react-modal";
import cstyles from "../common/Common.module.css";

const { ipcRenderer } = window.electronAPI;

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

const AppSecurityModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [requireAuth, setRequireAuth] = useState(true);
  const [savedRequireAuth, setSavedRequireAuth] = useState(true);
  const [availability, setAvailability] = useState<
    "checking" | "available" | "not_configured" | "not_installed_linux" | "not_supported"
  >("checking");
  const [saving, setSaving] = useState(false);

  const hasChanges = requireAuth !== savedRequireAuth;

  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      setAvailability("checking");
      const [allSettings, avail] = await Promise.all([
        ipcRenderer.invoke("loadSettings"),
        ipcRenderer.invoke("auth:check"),
      ]);
      const saved = allSettings?.requireDeviceAuth ?? false;
      setRequireAuth(saved);
      setSavedRequireAuth(saved);
      setAvailability(avail as "checking" | "available" | "not_configured" | "not_installed_linux" | "not_supported");
    })();
  }, [isOpen]);

  const handleSave = async () => {
    setSaving(true);
    await ipcRenderer.invoke("saveSettings", { key: "requireDeviceAuth", value: requireAuth });
    setSaving(false);
    onClose();
  };

  const unavailableMessage =
    availability === "not_configured"
      ? "Windows Hello is not configured on this device. Go to Windows Settings → Accounts → Sign-in options to set it up."
      : availability === "not_installed_linux"
        ? "Device authentication via polkit is not available. Install the Zingo PC .deb package to enable this feature."
        : availability === "not_supported"
          ? "Device authentication is not supported on this platform."
          : null;

  const isAvailable = availability === "available";

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      className={cstyles.modalOverlay}
      overlayClassName={cstyles.modalOverlay}
      style={{
        content: {
          background: "var(--bg-color, #1a1a2e)",
          border: "1px solid #444",
          borderRadius: 8,
          padding: 32,
          maxWidth: 440,
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
      <div className={`${cstyles.xlarge} ${cstyles.center}`}>App Security</div>

      <div className={`${cstyles.well} ${cstyles.margintopsmall}`} style={{ marginTop: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div className={cstyles.small}>Require device authentication</div>
            <div className={cstyles.small} style={{ opacity: 0.6, marginTop: 4 }}>
              Prompt for device authentication when opening the app and when sending funds.
            </div>
          </div>
          <input
            type="checkbox"
            checked={requireAuth}
            disabled={!isAvailable}
            onChange={(e) => setRequireAuth(e.target.checked)}
            style={{
              width: 18,
              height: 18,
              marginLeft: 16,
              cursor: isAvailable ? "pointer" : "not-allowed",
              accentColor: "var(--color-primary)",
            }}
          />
        </div>

        {unavailableMessage && (
          <div className={`${cstyles.small} ${cstyles.margintopsmall}`} style={{ opacity: 0.7, marginTop: 12 }}>
            {unavailableMessage}
          </div>
        )}

        {availability === "checking" && (
          <div className={`${cstyles.small} ${cstyles.margintopsmall}`} style={{ opacity: 0.6, marginTop: 12 }}>
            Checking device authentication availability...
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 24 }}>
        <button type="button" className={cstyles.primarybutton} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className={cstyles.primarybutton}
          onClick={handleSave}
          disabled={saving || availability === "checking" || !hasChanges}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </Modal>
  );
};

export default AppSecurityModal;
