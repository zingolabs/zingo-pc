import React, { useMemo, useState } from "react";
import Modal from "react-modal";

import styles from "../history/History.module.css";
import cstyles from "./Common.module.css";
import { chainDisplayName } from "../swap/chainDisplayName";
import { ChainBadge } from "./ChainBadge";

type ChainPickerProps = {
  /** Chain codes to choose between, in the order they should be offered. */
  chains: string[];
  selected: string;
  modalIsOpen: boolean;
  closeModal: () => void;
  onSelect: (chain: string) => void;
};

/**
 * Which chain an address belongs to, chosen from a list rather than a select.
 *
 * The same shape as the swap screen's asset picker, because it answers the
 * same kind of question: a row per option, an icon so the answer is
 * recognisable before it is read, and a search for when the list is long.
 *
 * A native `select` was what this replaced. It shows one line at a time, gives
 * the chain no badge to be recognised by, and renders as whatever the platform
 * decides — which on this form meant a control that looked nothing like the
 * two fields beside it.
 *
 * The search only appears once the list is long enough to need one. Offering
 * to filter three rows is a control that costs more attention than it saves.
 */
const SEARCH_APPEARS_ABOVE = 8;

const ChainPicker: React.FC<ChainPickerProps> = ({ chains, selected, modalIsOpen, closeModal, onSelect }) => {
  const [query, setQuery] = useState<string>("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return chains;
    // Matched on both the code and the name: a user reading "Mayachain" and a
    // user who knows it as MAYA are asking the same question.
    return chains.filter(
      (chain) => chain.toLowerCase().includes(q) || chainDisplayName(chain).toLowerCase().includes(q),
    );
  }, [chains, query]);

  return (
    <Modal
      isOpen={modalIsOpen}
      onRequestClose={closeModal}
      className={styles.txmodal}
      overlayClassName={styles.txmodalOverlay}
    >
      <div className={cstyles.verticalflex} style={{ height: "100%" }}>
        <div className={`${cstyles.center} ${cstyles.xlarge} ${cstyles.padtopsmall}`}>Choose a chain</div>

        {chains.length > SEARCH_APPEARS_ABOVE && (
          <div className={cstyles.fieldrow} style={{ marginTop: 12 }}>
            <input
              autoFocus
              aria-label="Search chains"
              className={cstyles.fieldinput}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or code"
            />
          </div>
        )}

        <div style={{ overflowY: "auto", overflowX: "hidden", flexGrow: 1, marginTop: 12 }}>
          {matches.length === 0 && (
            <div className={`${cstyles.center} ${cstyles.margintoplarge}`}>No chain matches that.</div>
          )}
          {matches.map((chain) => {
            const name = chainDisplayName(chain);
            return (
              <button
                key={chain}
                type="button"
                onClick={() => {
                  onSelect(chain);
                  closeModal();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  width: "100%",
                  padding: "8px 4px",
                  background: chain === selected ? "var(--color-background-dark)" : "none",
                  border: "none",
                  color: "inherit",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <ChainBadge chain={chain} size={32} />
                <div>
                  <div>{name || chain}</div>
                  {/* Only when it says something the line above did not. For
                      most chains the display name is the code spelled out. */}
                  {!!name && name.toUpperCase() !== chain.toUpperCase() && (
                    <div className={`${cstyles.sublight} ${cstyles.small}`}>{chain}</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className={`${cstyles.center} ${cstyles.margintoplarge}`}>
          <button type="button" className={cstyles.primarybutton} onClick={closeModal}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ChainPicker;
