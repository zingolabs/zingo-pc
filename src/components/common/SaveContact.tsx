import React, { useState } from "react";
import Modal from "react-modal";

import styles from "../history/History.module.css";
import swapStyles from "../swap/Swap.module.css";
import cstyles from "./Common.module.css";
import { Field } from "./DetailField";

type SaveContactProps = {
  /** The address being saved, shown so the user can see what they are naming. */
  address: string;
  /** The chain it belongs to, in words. */
  chainLabel: string;
  modalIsOpen: boolean;
  closeModal: () => void;
  onSave: (label: string) => void;
};

/**
 * Asks for the name to file an address under.
 *
 * This was a `window.prompt`, which Electron does not implement: pressing save
 * threw `prompt() is not supported` and nothing reached the address book.
 *
 * Asking here rather than sending the user to the Address Book, which is what
 * both screens used to do. The swap form is local state, so leaving would
 * discard the amount, the address and the quote just to name a contact; Send's
 * form survives the trip, but arriving on another screen to answer one
 * question is a detour either way, and a contact should be saved the same way
 * wherever it is saved from.
 */
const SaveContact: React.FC<SaveContactProps> = ({ address, chainLabel, modalIsOpen, closeModal, onSave }) => {
  const [label, setLabel] = useState<string>("");
  const trimmed = label.trim();

  const save = () => {
    if (!trimmed) return;
    onSave(trimmed);
    closeModal();
  };

  return (
    <Modal
      isOpen={modalIsOpen}
      onRequestClose={closeModal}
      className={swapStyles.narrowmodal}
      overlayClassName={styles.txmodalOverlay}
    >
      <div className={cstyles.verticalflex}>
        <div className={`${cstyles.center} ${cstyles.xlarge} ${cstyles.padtopsmall}`}>Save contact</div>

        <Field label={`${chainLabel} address`} value={address} />

        <div className={cstyles.padtopsmall}>
          <div className={cstyles.sublight}>Name</div>
          <div className={cstyles.fieldrow}>
            <input
              autoFocus
              // The label above is a sibling, not a `<label for>`, so the field
              // had no accessible name of its own.
              aria-label="Name"
              className={cstyles.fieldinput}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              // Enter saves, since the field is the only thing to fill in.
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
              }}
              placeholder="What to call this contact"
            />
          </div>
        </div>

        <div className={`${cstyles.horizontalflex} ${cstyles.margintoplarge}`} style={{ justifyContent: "center" }}>
          <button type="button" className={cstyles.primarybutton} disabled={!trimmed} onClick={save}>
            Save
          </button>
          <button type="button" className={cstyles.primarybutton} onClick={closeModal}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default SaveContact;
