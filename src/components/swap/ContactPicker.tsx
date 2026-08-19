import React from "react";
import Modal from "react-modal";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";

import styles from "../history/History.module.css";
import cstyles from "../common/Common.module.css";
import { AddressBookEntryClass } from "../appstate";
import { chainDisplayName } from "./chainDisplayName";

type ContactPickerProps = {
  /** Already filtered to the chain being asked for. */
  contacts: AddressBookEntryClass[];
  chain: string;
  modalIsOpen: boolean;
  closeModal: () => void;
  onSelect: (address: string) => void;
};

/**
 * Contacts for one chain, to fill the swap's address field.
 *
 * Filtering happens before this renders, and the empty state says which chain
 * came up empty: a user with a full address book of Zcash contacts opening
 * this for Bitcoin would otherwise read the blank list as a fault.
 */
const ContactPicker: React.FC<ContactPickerProps> = ({ contacts, chain, modalIsOpen, closeModal, onSelect }) => (
  <Modal
    isOpen={modalIsOpen}
    onRequestClose={closeModal}
    className={styles.txmodal}
    overlayClassName={styles.txmodalOverlay}
  >
    <div className={cstyles.verticalflex} style={{ height: "100%" }}>
      <div className={`${cstyles.center} ${cstyles.xlarge} ${cstyles.padtopsmall}`}>
        {chainDisplayName(chain) || chain} contacts
      </div>

      <div style={{ overflowY: "auto", flexGrow: 1, marginTop: 12 }}>
        {contacts.length === 0 && (
          <div className={`${cstyles.center} ${cstyles.margintoplarge}`}>
            No {chainDisplayName(chain) || chain} addresses saved yet. Save one from this screen and it will appear
            here.
          </div>
        )}
        {contacts.map((contact) => (
          <button
            key={`${contact.label}-${contact.address}`}
            type="button"
            onClick={() => {
              onSelect(contact.address);
              closeModal();
            }}
            style={{
              display: "block",
              width: "100%",
              padding: "8px 4px",
              background: "none",
              border: "none",
              color: "inherit",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <div>{contact.label}</div>
            <div className={`${cstyles.sublight} ${cstyles.small} ${cstyles.breakword}`}>{contact.address}</div>
          </button>
        ))}
      </div>

      <div className={`${cstyles.center} ${cstyles.padtopsmall}`}>
        <button type="button" className={cstyles.primarybutton} onClick={closeModal}>
          Close &nbsp;
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>
    </div>
  </Modal>
);

export default ContactPicker;
