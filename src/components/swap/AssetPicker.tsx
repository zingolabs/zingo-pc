import React, { useMemo, useState } from "react";
import Modal from "react-modal";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";

import styles from "../history/History.module.css";
import cstyles from "../common/Common.module.css";
import type { TokenEntryType } from "../../swap";
import TokenLogo from "./TokenLogo";

type AssetPickerProps = {
  tokens: TokenEntryType[];
  selected: TokenEntryType | null;
  modalIsOpen: boolean;
  closeModal: () => void;
  onSelect: (token: TokenEntryType) => void;
};

/** Rows rendered at once. The catalog runs to hundreds of entries. */
const VISIBLE_LIMIT = 60;

/**
 * `TokenEntryType` declares `ticker`, `name` and `chain` as present, and the
 * live catalog ships entries missing them. The type describes the documented
 * response, not the one that arrives, so every read of those fields on a
 * catalog entry goes through here.
 */
const lower = (value: string | undefined): string => (value ?? "").toLowerCase();

/**
 * The asset picker.
 *
 * The catalog is far too long to scroll, so the search is the primary way
 * through it, matching on ticker, name and chain. Matches are ordered by how
 * closely they match rather than by catalog order: an exact ticker first, then
 * tickers that start with the query, then everything else. Typing "eth" should
 * reach Ethereum before it reaches a token whose name merely contains it.
 */
const AssetPicker: React.FC<AssetPickerProps> = ({ tokens, selected, modalIsOpen, closeModal, onSelect }) => {
  const [query, setQuery] = useState<string>("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tokens.slice(0, VISIBLE_LIMIT);

    const rank = (token: TokenEntryType): number => {
      const ticker = lower(token.ticker);
      if (ticker === q) return 0;
      if (ticker.startsWith(q)) return 1;
      if (lower(token.chain) === q) return 2;
      if (lower(token.name).startsWith(q)) return 3;
      return 4;
    };
    const hit = (token: TokenEntryType): boolean =>
      lower(token.ticker).includes(q) || lower(token.name).includes(q) || lower(token.chain).includes(q);

    return tokens
      .filter(hit)
      .sort((a, b) => rank(a) - rank(b))
      .slice(0, VISIBLE_LIMIT);
  }, [tokens, query]);

  return (
    <Modal
      isOpen={modalIsOpen}
      onRequestClose={closeModal}
      className={styles.txmodal}
      overlayClassName={styles.txmodalOverlay}
    >
      <div className={cstyles.verticalflex} style={{ height: "100%" }}>
        <div className={`${cstyles.center} ${cstyles.xlarge} ${cstyles.padtopsmall}`}>Choose an asset</div>

        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by ticker, name or chain"
          style={{ width: "100%", marginTop: 12 }}
        />

        <div style={{ overflowY: "auto", flexGrow: 1, marginTop: 12 }}>
          {matches.length === 0 && (
            <div className={`${cstyles.center} ${cstyles.margintoplarge}`}>Nothing in the catalog matches that.</div>
          )}
          {matches.map((token) => (
            <button
              key={token.identifier}
              type="button"
              onClick={() => {
                onSelect(token);
                closeModal();
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                width: "100%",
                padding: "8px 4px",
                background: token.identifier === selected?.identifier ? "var(--color-background-dark)" : "none",
                border: "none",
                color: "inherit",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <TokenLogo token={token} size={32} surfaceColor="var(--color-background)" />
              <div>
                <div>
                  {token.ticker} <span className={cstyles.sublight}>{token.chain}</span>
                </div>
                <div className={`${cstyles.sublight} ${cstyles.small}`}>{token.name}</div>
              </div>
            </button>
          ))}
          {matches.length === VISIBLE_LIMIT && (
            <div className={`${cstyles.center} ${cstyles.sublight} ${cstyles.small} ${cstyles.padtopsmall}`}>
              Showing the first {VISIBLE_LIMIT}. Narrow the search to see more.
            </div>
          )}
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
};

export default AssetPicker;
