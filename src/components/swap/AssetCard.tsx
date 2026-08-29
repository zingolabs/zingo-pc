import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";

import cstyles from "../common/Common.module.css";
import styles from "./AssetCard.module.css";
import type { TokenEntryType } from "../../swap";
import TokenLogo from "./TokenLogo";
import { ZEC_TOKEN_ENTRY } from "./swapAssets";

/**
 * One side of the swap: what the asset is, how much of it, and where it lands.
 *
 * Ported from the mobile wallet's `renderAssetCard`. The whole side lives in
 * one card — chip, amount and address together — because they describe a
 * single thing; splitting them into separate rows down the screen, which is
 * what this screen did before, left the user assembling the meaning
 * themselves.
 *
 * ZEC is non-selectable, being the fixed side of every swap here, so its chip
 * is inert and carries no chevron. Both chips still go through the same
 * `TokenLogo` so the two sides look like the same kind of thing.
 */
export type AssetCardProps = {
  role: "source" | "destination";
  isZec: boolean;
  /** The counterparty asset, when this side is not ZEC. */
  token: TokenEntryType | null;
  /** Right of the title: spendable balance, or whatever the side can say. */
  balanceLabel?: string;
  amount: string;
  /** Source amounts are typed; destination amounts are the quote's estimate. */
  editable: boolean;
  invalid?: boolean;
  onChangeAmount?: (value: string) => void;
  /** Line under the amount — fiat value, or why the amount is refused. */
  amountSub?: React.ReactNode;
  onSelectAsset?: () => void;
  selectDisabled?: boolean;
  address?: {
    label: string;
    /** Name this address is filed under, when it is one. */
    contactLabel?: string;
    value: string;
    placeholder?: string;
    /** Already gated on "touched" by the caller; this only draws it. */
    invalid?: boolean;
    errorText?: string;
    onChange: (value: string) => void;
    onBlur?: () => void;
    /** Opens the contact list for this chain. */
    onPick?: () => void;
    /** Saves the current value as a contact. Absent once it already is one. */
    onSave?: () => void;
  };
};

const AssetCard: React.FC<AssetCardProps> = ({
  role,
  isZec,
  token,
  balanceLabel,
  amount,
  editable,
  invalid,
  onChangeAmount,
  amountSub,
  onSelectAsset,
  selectDisabled,
  address,
}) => {
  const title = role === "source" ? "You Send" : "You Receive (Estimated)";
  const entry = isZec ? ZEC_TOKEN_ENTRY : token;
  const symbol = isZec ? "ZEC" : (token?.ticker ?? "Choose");

  const chipInner = (
    <>
      <TokenLogo token={entry} size={22} surfaceColor="var(--color-background-dark)" />
      <span className={styles.chipsymbol} style={isZec ? { color: "var(--color-primary)" } : undefined}>
        {symbol}
      </span>
      {!isZec && <FontAwesomeIcon icon={faChevronDown} style={{ fontSize: 12 }} />}
    </>
  );

  return (
    <div className={styles.card}>
      <div className={styles.headerrow}>
        <div className={styles.cardlabel}>{title}</div>
        <div className={styles.cardlabel}>{balanceLabel ?? ""}</div>
      </div>

      <div className={styles.bodyrow}>
        {isZec ? (
          <div className={styles.chip}>{chipInner}</div>
        ) : (
          <button
            type="button"
            className={`${styles.chip} ${styles.chipbutton}`}
            onClick={onSelectAsset}
            disabled={selectDisabled}
            aria-label={token ? `Change asset, currently ${token.ticker ?? ""}` : "Choose an asset"}
          >
            {chipInner}
          </button>
        )}

        <div className={styles.amountcol}>
          {editable ? (
            <input
              className={`${styles.amountinput} ${invalid ? styles.amountinvalid : ""}`}
              value={amount}
              onChange={(e) => onChangeAmount?.(e.target.value)}
              placeholder="0"
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              aria-label="Amount"
            />
          ) : (
            <div className={styles.amounttext}>{amount || "0"}</div>
          )}
          {amountSub && <div className={`${cstyles.sublight} ${styles.amountsub}`}>{amountSub}</div>}
        </div>
      </div>

      {address && (
        <div className={styles.addressblock}>
          {/* The name beside the label rather than inside the field: what the
              address is belongs with its title, and the field itself is for
              the address and the things to do with it. Same arrangement the
              Send screen uses. */}
          <div className={cstyles.flexspacebetween}>
            <div className={`${cstyles.sublight} ${styles.addresslabel}`}>{address.label}</div>
            {!!address.contactLabel && (
              <div className={`${cstyles.green} ${styles.addresslabel}`}>Contact: {address.contactLabel}</div>
            )}
          </div>
          {/* Field and its actions share a border, so they read as one control
              rather than a box with loose buttons beside it. */}
          <div className={`${cstyles.fieldrow} ${address.invalid ? styles.addressinvalid : ""}`}>
            <input
              className={cstyles.fieldinput}
              value={address.value}
              onChange={(e) => address.onChange(e.target.value)}
              onBlur={address.onBlur}
              placeholder={address.placeholder}
              autoComplete="off"
              spellCheck={false}
              aria-label={address.label}
            />
            {/* Same glyphs and labels the Send screen already uses for these
                two actions, so the same gesture looks the same in both places. */}
            {address.value.length > 0 && (
              <button
                type="button"
                className={cstyles.fieldaction}
                onClick={() => address.onChange("")}
                aria-label="Clear recipient"
                title="Clear recipient"
              >
                <i className={`${"fas"} ${"fa-times-circle"} ${"fa-lg"}`} />
              </button>
            )}
            {address.onPick && (
              <button
                type="button"
                className={cstyles.fieldaction}
                onClick={address.onPick}
                aria-label="Choose from contacts"
                title="Choose from contacts"
              >
                {/* The same icon the sidebar gives the Address Book, so the
                    button reads as the place it opens rather than as a list. */}
                <i className={`${"fas"} ${"fa-address-book"} ${"fa-lg"}`} />
              </button>
            )}
            {address.onSave && (
              <button
                type="button"
                className={cstyles.fieldaction}
                onClick={address.onSave}
                aria-label="Save as contact"
                title="Save as contact"
              >
                <i className={`${"fas"} ${"fa-user-plus"} ${"fa-lg"}`} />
              </button>
            )}
          </div>
          {address.invalid && address.errorText && <div className={styles.errortext}>{address.errorText}</div>}
        </div>
      )}
    </div>
  );
};

export default AssetCard;
