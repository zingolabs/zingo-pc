import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";
import styles from "../Send.module.css";
import cstyles from "../../common/Common.module.css";
import { AddressBookEntryClass, AddressKindEnum, ServerChainNameEnum, ToAddrClass } from "../../appstate";
import Utils from "../../../utils/utils";
import ArrowUpLight from "../../../assets/img/arrow_up_dark.png";
import { ContextApp } from "../../../context/ContextAppState";
import { isSameZnsAlias, isZnsAlias, extractZnsName, resolveZnsAlias } from "../../../utils/zns";
import { shell } from "../../../electronBridge";
import ContactPicker from "../../common/ContactPicker";
import SaveContact from "../../common/SaveContact";
import { ZEC_SWAP_CHAIN } from "../../appstate/classes/AddressBookEntryClass";
import RecipientStatusType from "./RecipientStatusType";
import {
  faAddressBook,
  faCheck,
  faEnvelope,
  faExternalLinkSquareAlt,
  faTimesCircle,
  faTrashAlt,
  faUserPlus,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

const Spacer = () => {
  return <div style={{ marginTop: "14px" }} />;
};

type ToAddrBoxProps = {
  toaddr: ToAddrClass;
  // Position in the batch, and the batch's size. A lone recipient shows no
  // number and no remove action, so a one-recipient send reads as it always did.
  index?: number;
  total?: number;
  // Every row but the one being edited folds to a single line.
  collapsed?: boolean;
  onExpand?: () => void;
  onRemove?: () => void;
  // The earlier row paying this same address, if any. Allowed, but more often
  // a slip than a second payment, so it is pointed out.
  duplicateOfIndex?: number;
  zecPrice: number;
  updateToField: (address: string | null, amount: string | null, memo: string | null) => void;
  updateZnsAlias: (znsAlias: string) => void;
  fromAmount: number;
  // What is left for this row once the other rows, and the outputs they add to
  // the fee, are paid for.
  maxAmount: number;
  setMaxAmount: (total: number) => void;
  onStatusChange: (status: RecipientStatusType) => void;
  serverChainName: "" | ServerChainNameEnum;
  block: number;
  currencyName: string;
  addAddressBookEntry: (label: string, address: string, chain: ServerChainNameEnum, swapChain?: string) => void;
};

const ToAddrBox = ({
  toaddr,
  index = 0,
  total = 1,
  collapsed = false,
  onExpand,
  onRemove,
  duplicateOfIndex,
  zecPrice,
  updateToField,
  updateZnsAlias,
  fromAmount,
  maxAmount,
  setMaxAmount,
  onStatusChange,
  serverChainName,
  block,
  currencyName,
  addAddressBookEntry,
}: ToAddrBoxProps) => {
  const context = useContext(ContextApp);
  const { addressBook } = context;

  const [toLocal, setToLocal] = useState<string>(toaddr.to);
  const [amountLocal, setAmountLocal] = useState<number>(toaddr.amount);
  const [memoLocal, setMemoLocal] = useState<string>(toaddr.memo);

  const [addressKind, setAddressKind] = useState<AddressKindEnum>();
  const [isMemoDisabled, setIsMemoDisabled] = useState<boolean>(false);
  const [addressIsValid, setAddressIsValid] = useState<number>(0);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [usdValue, setUsdValue] = useState<string>("");
  const [memoError, setMemoError] = useState<string | null>(null);

  // ZNS resolution state. `znsAlias` is persisted via `toaddr.znsAlias` so the
  // badge survives Send ↔ AddressBook navigation. `znsStatus` is purely transient.
  const [znsAlias, setZnsAliasLocal] = useState<string>(toaddr.znsAlias);
  const [znsStatus, setZnsStatus] = useState<"idle" | "resolving" | "not-found" | "network">("idle");
  const [contactsOpen, setContactsOpen] = useState<boolean>(false);
  const [saveContactOpen, setSaveContactOpen] = useState<boolean>(false);
  // Named once: the contact list and the save prompt should call the chain the
  // same thing on the same screen.
  const zcashChainLabel = currencyName === "TAZ" ? "Testnet Zcash" : "Zcash";

  // Zcash contacts only. The address book holds swap contacts too, and those
  // carry this same `chain` — swaps are mainnet-only, so a Bitcoin address is
  // stored against the main network with its own `swapChain`. Filtering on the
  // network alone would offer a Bitcoin address to a Zcash send.
  const zcashContacts = useMemo(
    () =>
      addressBook.filter(
        (ab: AddressBookEntryClass) =>
          ab.chain === serverChainName && (ab.swapChain ?? ZEC_SWAP_CHAIN) === ZEC_SWAP_CHAIN,
      ),
    [addressBook, serverChainName],
  );
  // Wrap the setter so every local change is mirrored to the parent state.
  const setZnsAlias = (alias: string) => {
    setZnsAliasLocal(alias);
    updateZnsAlias(alias);
  };

  // The verdict goes up through this rather than through the prop itself: the
  // screen hands over a fresh closure on every render, and the validation below
  // should rerun when what it checks changes, not when that closure does.
  const onStatusChangeRef = useRef<(status: RecipientStatusType) => void>(onStatusChange);
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  });

  useEffect(() => {
    setToLocal(toaddr.to);
    setAmountLocal(toaddr.amount);
    setMemoLocal(toaddr.memo);
    setZnsAliasLocal(toaddr.znsAlias);
  }, [toaddr.to, toaddr.amount, toaddr.memo, toaddr.znsAlias]);

  // Debounced ZNS resolver — kicks in 500ms after the user stops typing
  // a "*.zcash" alias, swaps the input to the resolved UA on success.
  useEffect(() => {
    if (!isZnsAlias(toLocal)) {
      // Either an explicit UA was entered, or a previous resolution finished
      // and put the UA in the input. Either way, no resolution to do here;
      // clear any leftover status so the badge disappears.
      if (znsStatus !== "idle") setZnsStatus("idle");
      return;
    }
    setZnsStatus("resolving");
    const id = setTimeout(async () => {
      const result = await resolveZnsAlias(toLocal, serverChainName);
      if (result.ok) {
        setZnsAlias(toLocal);
        setZnsStatus("idle");
        setToLocal(result.address);
        updateToField(result.address, null, null);
      } else if (result.reason === "not-found") {
        setZnsStatus("not-found");
      } else if (result.reason === "network") {
        setZnsStatus("network");
      } else {
        // unsupported-chain or invalid-name — silently drop, treated as plain text
        setZnsStatus("idle");
      }
    }, 500);
    return () => clearTimeout(id);
    // updateToField is stable enough that adding it as a dep just causes spurious reruns
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toLocal, serverChainName]);

  // Generic "clear the recipient field" — handles both the ZNS-resolved case
  // (where znsAlias is set) and the contact-match case (where it isn't).
  const clearToAddress = () => {
    setZnsAlias("");
    setZnsStatus("idle");
    setToLocal("");
    updateToField("", null, null);
  };

  useEffect(() => {
    // A later run supersedes this one. Without the flag, a slow address check
    // for an earlier keystroke could land after a faster one and report a
    // verdict for text no longer in the field.
    let cancelled: boolean = false;
    (async () => {
      const _addressKind: AddressKindEnum | undefined = await Utils.getAddressKind(toLocal, serverChainName);
      if (cancelled) return;
      setAddressKind(_addressKind);
      const _isMemoDisabled: boolean = !(
        _addressKind === AddressKindEnum.sapling || _addressKind === AddressKindEnum.unified
      );
      setIsMemoDisabled(_isMemoDisabled);

      let _addressIsValid: number;
      if (!toLocal) {
        _addressIsValid = 0;
      } else if (_addressKind !== undefined) {
        _addressIsValid = 1;
      } else {
        _addressIsValid = -1;
      }
      setAddressIsValid(_addressIsValid);

      let _amountError: string | null = null;
      if (amountLocal) {
        if (amountLocal < 0) {
          _amountError = "Amount cannot be negative";
        }
        if (amountLocal > fromAmount) {
          _amountError = "Amount Exceeds Balance";
        }
        if (amountLocal < 10 ** -8) {
          _amountError = "Amount is too small";
        }
        const s = amountLocal.toString().split(".");
        if (s && s.length > 1 && s[1].length > 8) {
          _amountError = "Too Many Decimals";
        }
      }

      if (isNaN(amountLocal)) {
        // Amount is empty
        _amountError = "Amount cannot be empty";
      }
      setAmountError(_amountError);

      let _memoError: string | null = null;
      if ((memoLocal + toaddr.memoReplyTo).length > 511) {
        _memoError = "Memo is too long";
      }
      setMemoError(_memoError);

      // The fee belongs to the transaction, not to this row, so the row no
      // longer quotes it. It says whether it is ready and what kind of address
      // it pays; the screen quotes the batch once every row is ready.
      onStatusChangeRef.current({
        valid: _addressIsValid === 1 && _amountError === null && _memoError === null && fromAmount >= 0,
        addressKind: _addressKind,
      });

      const usdValue: string = Utils.getZecToUsdString(zecPrice, amountLocal);
      setUsdValue(usdValue);
    })();
    return () => {
      cancelled = true;
    };
  }, [fromAmount, zecPrice, serverChainName, block, toLocal, amountLocal, memoLocal, toaddr.memoReplyTo]);

  // Returns the contact label for `addr` if it matches an address-book entry
  // ON THE CURRENT NETWORK. Cross-network matches are filtered out so the user
  // never sees "Contact: Alice" when Alice belongs to a different chain.
  // Suppressed while the input looks like a ZNS alias that's about to resolve —
  // otherwise the badge briefly shows "Contact: …" and then flips to "ZNS: …".
  const getContactLabel = (addr: string): string | null => {
    if (!addr || isZnsAlias(addr)) return null;
    const entry: AddressBookEntryClass | undefined = addressBook.find(
      (ab: AddressBookEntryClass) => ab.address === addr && ab.chain === serverChainName,
    );
    return entry ? entry.label : null;
  };
  const contactLabel = getContactLabel(toLocal);
  // Matched by the name rather than the text typed, so a contact saved as
  // "pepe.zcash" is still recognised when the user writes "pepe.zec".
  const znsIsContact = addressBook.some(
    (ab: AddressBookEntryClass) => isSameZnsAlias(ab.address, znsAlias) && ab.chain === serverChainName,
  );
  // A ZNS alias is saved as the alias rather than the address it resolves to,
  // so the contact re-resolves every time it is used.
  const saveTarget = znsAlias || (addressIsValid === 1 ? toLocal : "");
  const canSave = !!saveTarget && !(znsAlias ? znsIsContact : !!contactLabel);

  // Consensus refuses a zero-valued transparent output, so a transparent or TEX
  // recipient left at zero cannot be paid. Not an error while the amount is
  // still to be typed, only something the row cannot do yet: said in yellow
  // while the row is open, and in red once folded, where it is a row stopping
  // the batch like any other.
  const needsAmount: boolean =
    addressIsValid === 1 &&
    (addressKind === AddressKindEnum.transparent || addressKind === AddressKindEnum.tex) &&
    amountLocal === 0;

  const numbered: boolean = total > 1;

  const removeButton = !!onRemove && (
    <button
      type="button"
      className={cstyles.fieldaction}
      aria-label={`Remove recipient ${index + 1}`}
      title="Remove recipient"
      onClick={onRemove}
    >
      <FontAwesomeIcon icon={faTrashAlt} size="lg" />
    </button>
  );

  if (collapsed) {
    // One line: who, how much, whether a memo rides along. The whole line is
    // the button that unfolds it, and the remove action sits outside it so a
    // press meant for one cannot trigger the other. Red when the row would stop
    // the batch, so a problem is not hidden by being folded away.
    const rowHasProblem: boolean = addressIsValid !== 1 || !!amountError || !!memoError || needsAmount;
    const name: string = znsAlias || contactLabel || "";
    return (
      <div className={`${cstyles.well} ${styles.recipientcompact}`}>
        <button
          type="button"
          className={styles.recipientcompactbutton}
          aria-label={`Edit recipient ${index + 1}`}
          onClick={onExpand}
        >
          <span className={cstyles.sublight}>{index + 1}</span>
          <span className={`${styles.recipientcompactaddress} ${rowHasProblem ? cstyles.red : ""}`}>
            {toLocal ? (
              <>
                {!!name && <span className={cstyles.highlight}>{name} · </span>}
                {Utils.trimToSmall(toLocal, 5)}
              </>
            ) : (
              "No address yet"
            )}
          </span>
          <span className={amountError || needsAmount ? cstyles.red : undefined}>
            {currencyName} {isNaN(amountLocal) ? 0 : Utils.maxPrecisionTrimmed(amountLocal)}
          </span>
          {!!memoLocal && <FontAwesomeIcon icon={faEnvelope} title="Carries a memo" />}
        </button>
        {removeButton}
      </div>
    );
  }

  return (
    <div style={numbered ? { marginBottom: 8 } : undefined}>
      <div className={`${cstyles.well} ${cstyles.verticalflex}`}>
        <div style={{ marginBottom: 5 }} className={cstyles.flexspacebetween}>
          <div className={cstyles.horizontalflex}>
            {numbered && (
              <div className={cstyles.sublight} style={{ marginRight: 10 }}>
                {index + 1}
              </div>
            )}
            <div className={cstyles.sublight}>To </div>
            {/* What the recipient is stays here beside the label. What can be
                done about it moved into the field below, which is where the
                swap screen keeps the same three actions. */}
            <div style={{ fontWeight: 900, marginLeft: 20 }} className={cstyles.green}>
              {znsAlias
                ? `${znsIsContact ? "Contact & ZNS" : "ZNS"}: ${znsAlias}`
                : contactLabel
                  ? `Contact: ${contactLabel}`
                  : ""}
            </div>
          </div>
          <div className={`${cstyles.sublight} ${cstyles.green}`}>
            {addressKind !== undefined && addressKind === AddressKindEnum.tex && "TEX"}
            {addressKind !== undefined && addressKind === AddressKindEnum.transparent && "Transparent"}
            {addressKind !== undefined && addressKind === AddressKindEnum.sapling && "Sapling"}
            {addressKind !== undefined && addressKind === AddressKindEnum.unified && "Unified"}
          </div>
          <div className={cstyles.validationerror}>
            {znsStatus === "resolving" && <span className={cstyles.sublight}>Resolving ZNS…</span>}
            {znsStatus === "not-found" && <span className={cstyles.red}>ZNS name not found</span>}
            {znsStatus === "network" && <span className={cstyles.red}>ZNS lookup failed</span>}
            {znsStatus === "idle" && addressIsValid === 1 && (
              <FontAwesomeIcon icon={faCheck} className={cstyles.green} />
            )}
            {znsStatus === "idle" && addressIsValid === -1 && <span className={cstyles.red}>Invalid Address</span>}
          </div>
          {removeButton}
        </div>
        {duplicateOfIndex !== undefined && (
          <div className={`${cstyles.yellow} ${cstyles.small}`} style={{ marginBottom: 5 }}>
            Same address as recipient {duplicateOfIndex + 1}
          </div>
        )}
        {/* Field and its actions share a border, so they read as one control
            rather than a box with loose buttons above it. Same glyphs, same
            order and same colour as the swap screen's address field. */}
        <div className={cstyles.fieldrow}>
          <input
            type="text"
            aria-label="Recipient address"
            placeholder="Unified | Sapling | Transparent | TEX address | name.zcash/.zec"
            className={cstyles.fieldinput}
            value={toLocal}
            readOnly={!!znsAlias}
            onChange={(e) => {
              setToLocal(e.target.value);
              updateToField(e.target.value, null, null);
            }}
          />
          {!!znsAlias && (
            <button
              type="button"
              className={cstyles.fieldaction}
              aria-label="View on zcashnames.com"
              title="View on zcashnames.com"
              onClick={() => {
                const name = encodeURIComponent(extractZnsName(znsAlias) ?? "");
                const env = serverChainName === ServerChainNameEnum.testChainName ? "&env=testnet" : "";
                shell.openExternal(`https://www.zcashnames.com/explorer?name=${name}${env}`);
              }}
            >
              <FontAwesomeIcon icon={faExternalLinkSquareAlt} size="lg" />
            </button>
          )}
          {toLocal.length > 0 && (
            <button
              type="button"
              className={cstyles.fieldaction}
              aria-label="Clear recipient"
              title="Clear recipient"
              onClick={clearToAddress}
            >
              <FontAwesomeIcon icon={faTimesCircle} size="lg" />
            </button>
          )}
          {zcashContacts.length > 0 && (
            <button
              type="button"
              className={cstyles.fieldaction}
              aria-label="Choose from contacts"
              title="Choose from contacts"
              onClick={() => setContactsOpen(true)}
            >
              {/* The icon the sidebar gives the Address Book, so the button
                  reads as the place it opens rather than as a list. */}
              <FontAwesomeIcon icon={faAddressBook} size="lg" />
            </button>
          )}
          {canSave && (
            <button
              type="button"
              className={cstyles.fieldaction}
              aria-label="Save as contact"
              title="Save as contact"
              onClick={() => setSaveContactOpen(true)}
            >
              <FontAwesomeIcon icon={faUserPlus} size="lg" />
            </button>
          )}
        </div>

        {saveContactOpen && (
          <SaveContact
            address={saveTarget}
            chainLabel={zcashChainLabel}
            modalIsOpen={saveContactOpen}
            closeModal={() => setSaveContactOpen(false)}
            // ZEC, and the network this wallet is on — the same pair the
            // Address Book screen files a Zcash contact under.
            onSave={(label) =>
              addAddressBookEntry(
                label,
                saveTarget,
                serverChainName || ServerChainNameEnum.mainChainName,
                ZEC_SWAP_CHAIN,
              )
            }
          />
        )}

        {contactsOpen && (
          <ContactPicker
            contacts={zcashContacts}
            chainLabel={zcashChainLabel}
            modalIsOpen={contactsOpen}
            closeModal={() => setContactsOpen(false)}
            onSelect={(address) => {
              // Straight into the field, so the same validation, ZNS check and
              // contact badge run as if it had been typed.
              setToLocal(address);
              updateToField(address, null, null);
            }}
          />
        )}

        <Spacer />

        {/* The fee used to sit beside the amount. It is the transaction's, not
            this recipient's, so it moved under the recipients with the total. */}
        <div className={cstyles.verticalflex}>
          <div style={{ marginBottom: 5 }} className={cstyles.flexspacebetween}>
            <div className={cstyles.sublight}>Amount</div>
            <div className={cstyles.validationerror}>
              {amountError ? (
                <span className={cstyles.red}>{amountError}</span>
              ) : needsAmount ? (
                <span className={cstyles.yellow}>Transparent addresses need an amount</span>
              ) : currencyName === "ZEC" ? (
                <span>{usdValue}</span>
              ) : null}
            </div>
          </div>
          <div className={cstyles.fieldrow}>
            <input
              type="number"
              aria-label="Amount"
              step="any"
              className={cstyles.fieldamount}
              value={isNaN(amountLocal) ? "" : amountLocal}
              onChange={(e) => {
                setAmountLocal(Number(e.target.value));
                updateToField(null, e.target.value, null);
              }}
            />
            <button
              type="button"
              aria-label="Set maximum amount"
              style={{ background: "none", border: "none", padding: "0 10px 0 0", cursor: "pointer" }}
              onClick={() => setMaxAmount(maxAmount)}
            >
              <img className={styles.toaddrbutton} src={ArrowUpLight} alt="" />
            </button>
          </div>
        </div>

        <Spacer />

        {isMemoDisabled && <div className={cstyles.sublight}>Memos only for Unified or Sapling addresses</div>}

        {!isMemoDisabled && (
          <div className={cstyles.verticalflex}>
            <div style={{ marginBottom: 5 }} className={cstyles.flexspacebetween}>
              <div className={cstyles.sublight}>Memo</div>
              <div className={cstyles.validationerror}>
                {memoError ? (
                  <span className={cstyles.red}>{memoError + ". " + (memoLocal + toaddr.memoReplyTo).length}</span>
                ) : (
                  <span>{(memoLocal + toaddr.memoReplyTo).length}</span>
                )}
              </div>
            </div>
            <div className={cstyles.fieldrowmulti}>
              <TextareaAutosize
                aria-label="Memo"
                className={cstyles.fieldtextarea}
                value={memoLocal}
                disabled={isMemoDisabled}
                onChange={(e) => {
                  setMemoLocal(e.target.value);
                  updateToField(null, null, e.target.value);
                }}
                minRows={2}
                maxRows={5}
              />
            </div>
            {toaddr.memoReplyTo && (
              <div className={`${cstyles.fieldrowmulti} ${cstyles.margintopsmall}`}>
                <TextareaAutosize
                  aria-label="Reply-to address"
                  className={cstyles.fieldtextarea}
                  value={toaddr.memoReplyTo}
                  disabled={true}
                  minRows={2}
                  maxRows={5}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ToAddrBox;
