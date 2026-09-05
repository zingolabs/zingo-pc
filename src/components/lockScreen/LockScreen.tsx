import React, { useState } from "react";
import cstyles from "../common/Common.module.css";
import APP_VERSION from "../../version";
import { faLock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

const { ipcRenderer } = window.electronAPI;

type Props = {
  onUnlock: () => void;
};

const LockScreen: React.FC<Props> = ({ onUnlock }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleUnlock = async () => {
    setLoading(true);
    setError("");
    try {
      const result: { success: boolean } = await ipcRenderer.invoke("auth:verify", "Unlock Zingo PC");
      if (result.success) {
        onUnlock();
      } else {
        setError("Authentication was not completed. Please try again.");
      }
    } catch {
      setError("Authentication failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-background)",
        zIndex: 9999,
      }}
    >
      <FontAwesomeIcon icon={faLock} style={{ fontSize: 48, marginBottom: 24, opacity: 0.7 }} />
      <div className={`${cstyles.large} ${cstyles.center} ${cstyles.margintopsmall}`}>Zingo PC is locked</div>
      <div className={`${cstyles.sublight} ${cstyles.center}`} style={{ opacity: 0.5, marginTop: 4 }}>
        v{APP_VERSION}
      </div>
      <div
        className={`${cstyles.small} ${cstyles.center} ${cstyles.margintopsmall}`}
        style={{ opacity: 0.6, maxWidth: 320 }}
      >
        Device authentication is required to access this wallet.
      </div>
      {error && <div className={`${cstyles.small} ${cstyles.red} ${cstyles.margintopsmall}`}>{error}</div>}
      <button
        type="button"
        className={cstyles.primarybutton}
        style={{ marginTop: 32, minWidth: 140 }}
        onClick={handleUnlock}
        disabled={loading}
      >
        {loading ? "Authenticating..." : "Unlock"}
      </button>
    </div>
  );
};

export default LockScreen;
