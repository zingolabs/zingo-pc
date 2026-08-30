import React, { useState } from "react";
import Modal from "react-modal";
import cstyles from "../common/Common.module.css";

const { ipcRenderer } = window.electronAPI;

export type ImportScanResult = {
  sourceDir: string;
  present: string[];
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  scanResult: ImportScanResult | null;
};

type FileChoice = "replace" | "merge" | "skip";

// settings.json is intentionally NOT importable here: replacing it would clobber
// MAS-only fields (walletDirBookmark, requireDeviceAuth) and the migrated
// currentwalletid would point to a wallet ID that doesn't exist in this install.
// It's only migrated on first launch (when the container is empty).
const ImportDataModal: React.FC<Props> = ({ isOpen, onClose, scanResult }) => {
  const hasWallets = !!scanResult?.present.includes("wallets.json");
  const hasAddressBook = !!scanResult?.present.includes("AddressBook.json");

  const [walletsChoice, setWalletsChoice] = useState<FileChoice>("merge");
  const [addressBookChoice, setAddressBookChoice] = useState<FileChoice>("merge");
  const [applying, setApplying] = useState(false);

  const handleApply = async () => {
    if (!scanResult) return;
    setApplying(true);
    // Main process restarts the app on success — this call won't normally return.
    await ipcRenderer.invoke("import:apply", {
      sourceDir: scanResult.sourceDir,
      choices: {
        settings: "skip",
        wallets: hasWallets ? walletsChoice : "skip",
        addressBook: hasAddressBook ? addressBookChoice : "skip",
      },
    });
    setApplying(false);
  };

  const nothingSelected =
    (!hasWallets || walletsChoice === "skip") && (!hasAddressBook || addressBookChoice === "skip");

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      className={cstyles.centredsheet}
      overlayClassName={cstyles.modalOverlay}
      style={{ content: { maxWidth: 560 } }}
    >
      <div className={`${cstyles.xlarge} ${cstyles.center}`}>Import Data</div>

      <div className={`${cstyles.small} ${cstyles.margintopsmall}`} style={{ opacity: 0.7, marginTop: 12 }}>
        Source folder:
        <div style={{ wordBreak: "break-all", marginTop: 4 }}>{scanResult?.sourceDir ?? ""}</div>
      </div>

      <div className={`${cstyles.well} ${cstyles.margintopsmall}`} style={{ marginTop: 24 }}>
        {hasWallets && (
          <FileRow
            label="wallets.json"
            description="Your wallet list. Merge keeps existing wallets and adds new ones (deduped by file name)."
            value={walletsChoice}
            onChange={(v) => setWalletsChoice(v as FileChoice)}
            options={[
              { value: "replace", label: "Replace" },
              { value: "merge", label: "Merge (skip duplicates)" },
              { value: "skip", label: "Skip" },
            ]}
          />
        )}

        {hasAddressBook && (
          <FileRow
            label="AddressBook.json"
            description="Saved contacts. Merge keeps existing entries and adds new ones (deduped by address)."
            value={addressBookChoice}
            onChange={(v) => setAddressBookChoice(v as FileChoice)}
            options={[
              { value: "replace", label: "Replace" },
              { value: "merge", label: "Merge (skip duplicates)" },
              { value: "skip", label: "Skip" },
            ]}
          />
        )}
      </div>

      <div className={`${cstyles.small} ${cstyles.margintopsmall}`} style={{ opacity: 0.7, marginTop: 12 }}>
        Zingo PC will restart after import to load the new data.
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 24 }}>
        <button type="button" className={cstyles.primarybutton} onClick={onClose} disabled={applying}>
          Cancel
        </button>
        <button
          type="button"
          className={cstyles.primarybutton}
          onClick={handleApply}
          disabled={applying || nothingSelected}
        >
          {applying ? "Importing…" : "Apply & Restart"}
        </button>
      </div>
    </Modal>
  );
};

type FileRowProps = {
  label: string;
  description: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
};

const FileRow: React.FC<FileRowProps> = ({ label, description, value, onChange, options }) => (
  <div style={{ marginBottom: 16 }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div>
        <div className={cstyles.small}>{label}</div>
        <div className={cstyles.small} style={{ opacity: 0.6, marginTop: 4 }}>
          {description}
        </div>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ marginLeft: 16, padding: "4px 8px", minWidth: 200 }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  </div>
);

export default ImportDataModal;
