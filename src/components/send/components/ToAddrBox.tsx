import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import TextareaAutosize from "react-textarea-autosize";
import styles from "../Send.module.css";
import cstyles from "../../common/Common.module.css";
import { AddressBookEntryClass, AddressKindEnum, ServerChainNameEnum, ToAddrClass } from "../../appstate";
import Utils from "../../../utils/utils";
import ArrowUpLight from "../../../assets/img/arrow_up_dark.png";
import { ContextApp } from "../../../context/ContextAppState";
import { isZnsAlias, extractZnsName, resolveZnsAlias } from "../../../utils/zns";
import { shell } from "../../../electronBridge";
import routes from "../../../constants/routes.json";
import ContactPicker from "../../common/ContactPicker";
import { ZEC_SWAP_CHAIN } from "../../appstate/classes/AddressBookEntryClass";

const Spacer = () => {
  return <div style={{ marginTop: "24px" }} />;
};

type ToAddrBoxProps = {
  toaddr: ToAddrClass;
  zecPrice: number;
  updateToField: (address: string | null, amount: string | null, memo: string | null) => void;
  updateZnsAlias: (znsAlias: string) => void;
  fromAmount: number;
  fromAmountDefault: number;
  setSendButtonEnabled: (sendButtonEnabled: boolean) => void;
  setMaxAmount: (total: number) => void;
  sendFee: number;
  sendFeeError: string;
  fetchSendFeeAndErrorAndSpendable: () => Promise<void>;
  setSendFee: (fee: number) => void;
  setSendFeeError: (error: string) => void;
  setTotalAmountAvailable: (amount: number) => void;
  serverChainName: "" | ServerChainNameEnum;
  block: number;
  currencyName: string;
};

const ToAddrBox = ({
  toaddr,
  zecPrice,
  updateToField,
  updateZnsAlias,
  fromAmount,
  fromAmountDefault,
  setMaxAmount,
  setSendButtonEnabled,
  sendFee,
  sendFeeError,
  fetchSendFeeAndErrorAndSpendable,
  setSendFee,
  setSendFeeError,
  setTotalAmountAvailable,
  serverChainName,
  block,
  currencyName,
}: ToAddrBoxProps) => {
  const context = useContext(ContextApp);
  const { addressBook, setAddLabel } = context;
  const navigate = useNavigate();

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
    let buttonTimerId: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      const _addressKind: AddressKindEnum | undefined = await Utils.getAddressKind(toLocal, serverChainName);
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

      if (_amountError === null && _addressIsValid === 1 && _memoError === null) {
        fetchSendFeeAndErrorAndSpendable();
      } else {
        if (sendFee) {
          setSendFee(0);
          setSendFeeError("");
          setTotalAmountAvailable(fromAmountDefault);
        }
      }

      let buttonstate: boolean = true;
      if (
        _addressIsValid === -1 ||
        _amountError ||
        _memoError ||
        toLocal === "" ||
        fromAmount < 0 ||
        sendFee <= 0 ||
        sendFeeError
      ) {
        buttonstate = false;
      }

      buttonTimerId = setTimeout(() => {
        setSendButtonEnabled(buttonstate);
      }, 10);

      const usdValue: string = Utils.getZecToUsdString(zecPrice, amountLocal);
      setUsdValue(usdValue);
    })();
    return () => clearTimeout(buttonTimerId);
  }, [
    fetchSendFeeAndErrorAndSpendable,
    fromAmount,
    fromAmountDefault,
    sendFee,
    sendFeeError,
    setSendButtonEnabled,
    setSendFee,
    setSendFeeError,
    setTotalAmountAvailable,
    zecPrice,
    serverChainName,
    block,
    toLocal,
    amountLocal,
    memoLocal,
    toaddr.to,
    toaddr.amount,
    toaddr.memo,
    toaddr.memoReplyTo,
  ]);

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
  const znsIsContact = addressBook.some(
    (ab: AddressBookEntryClass) => ab.address === znsAlias && ab.chain === serverChainName,
  );
  // A ZNS alias is saved as the alias rather than the address it resolves to,
  // so the contact re-resolves every time it is used.
  const saveTarget = znsAlias || (addressIsValid === 1 ? toLocal : "");
  const canSave = !!saveTarget && !(znsAlias ? znsIsContact : !!contactLabel);

  return (
    <div>
      <div className={`${cstyles.well} ${cstyles.verticalflex}`}>
        <div style={{ marginBottom: 5 }} className={cstyles.flexspacebetween}>
          <div className={cstyles.horizontalflex}>
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
              <i className={`${cstyles.green} ${"fas"} ${"fa-check"}`} />
            )}
            {znsStatus === "idle" && addressIsValid === -1 && <span className={cstyles.red}>Invalid Address</span>}
          </div>
        </div>
        {/* Field and its actions share a border, so they read as one control
            rather than a box with loose buttons above it. Same glyphs, same
            order and same colour as the swap screen's address field. */}
        <div className={cstyles.fieldrow}>
          <input
            type="text"
            aria-label="Recipient address"
            placeholder="Unified | Sapling | Transparent | TEX address | name.zcash"
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
              <i className={`${"fas"} ${"fa-external-link-square-alt"} ${"fa-lg"}`} />
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
              <i className={`${"fas"} ${"fa-times-circle"} ${"fa-lg"}`} />
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
              <i className={`${"fas"} ${"fa-address-book"} ${"fa-lg"}`} />
            </button>
          )}
          {canSave && (
            <button
              type="button"
              className={cstyles.fieldaction}
              aria-label="Save as contact"
              title="Save as contact"
              onClick={() => {
                setAddLabel(new AddressBookEntryClass("", saveTarget));
                navigate(routes.ADDRESSBOOK);
              }}
            >
              <i className={`${"fas"} ${"fa-user-plus"} ${"fa-lg"}`} />
            </button>
          )}
        </div>

        {contactsOpen && (
          <ContactPicker
            contacts={zcashContacts}
            chainLabel={currencyName === "TAZ" ? "Testnet Zcash" : "Zcash"}
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

        {/* No well of its own. The whole box is already one, and a second
            inset these two fields by another 16px a side while the address
            above and the memo below sat flush against the outer edge. Its dark
            background was the same colour the fields carry, so only the
            misalignment ever showed. */}
        <div className={cstyles.flexspacebetween}>
          <div style={{ width: "60%" }} className={cstyles.verticalflex}>
            <div style={{ marginBottom: 5 }} className={cstyles.flexspacebetween}>
              <div className={cstyles.sublight}>Amount</div>
              <div className={cstyles.validationerror}>
                {amountError ? (
                  <span className={cstyles.red}>{amountError}</span>
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
                className={cstyles.fieldinput}
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
                onClick={() => setMaxAmount(fromAmount)}
              >
                <img className={styles.toaddrbutton} src={ArrowUpLight} alt="" />
              </button>
            </div>
          </div>
          <div style={{ width: "30%" }} className={cstyles.verticalflex}>
            <div style={{ marginBottom: 5 }} className={cstyles.horizontalflex}>
              <div
                style={{
                  color:
                    sendFeeError && !amountError && addressIsValid
                      ? Utils.getCssVariable("--color-error")
                      : Utils.getCssVariable("--color-text"),
                }}
                className={cstyles.sublight}
              >
                Fee
              </div>
              <div style={{ paddingTop: 3, paddingLeft: 10 }} title={sendFeeError}>
                <div className={cstyles.small}>
                  {sendFeeError && !amountError && addressIsValid !== -1 && (
                    <span>
                      &nbsp;
                      <i className={`${cstyles.red} ${"fas"} ${"fa-info-circle"}`} />
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className={cstyles.fieldrow}>
              <input
                type="number"
                aria-label="Transaction fee"
                step="any"
                className={cstyles.fieldinput}
                value={isNaN(sendFee) ? "" : sendFee}
                disabled={true}
              />
            </div>
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
