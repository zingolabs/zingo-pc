import React, { useContext, useEffect, useState } from "react";
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

const Spacer = () => {
  return <div style={{ marginTop: "24px" }} />;
};

const iconButtonStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "inherit",
  cursor: "pointer",
  padding: 0,
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

  return (
    <div>
      <div className={`${cstyles.well} ${cstyles.verticalflex}`}>
        <div style={{ marginBottom: 5 }} className={cstyles.flexspacebetween}>
          <div className={cstyles.horizontalflex}>
            <div className={cstyles.sublight}>To </div>
            <div style={{ fontWeight: 900, marginLeft: 20 }}>
              {znsAlias ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span className={cstyles.green}>
                    {addressBook.some(
                      (ab: AddressBookEntryClass) => ab.address === znsAlias && ab.chain === serverChainName,
                    )
                      ? "Contact & ZNS"
                      : "ZNS"}
                    {": "}
                    {znsAlias}
                  </span>
                  <button
                    type="button"
                    aria-label="View on zcashnames.com"
                    title="View on zcashnames.com"
                    onClick={() => {
                      const name = encodeURIComponent(extractZnsName(znsAlias) ?? "");
                      const env = serverChainName === ServerChainNameEnum.testChainName ? "&env=testnet" : "";
                      shell.openExternal(`https://www.zcashnames.com/explorer?name=${name}${env}`);
                    }}
                    style={iconButtonStyle}
                  >
                    <i className={`${"fas"} ${"fa-external-link-square-alt"} ${"fa-lg"}`} />
                  </button>
                  <button
                    type="button"
                    aria-label="Clear ZNS alias"
                    title="Clear ZNS alias"
                    onClick={clearToAddress}
                    style={iconButtonStyle}
                  >
                    <i className={`${"fas"} ${"fa-times-circle"} ${"fa-lg"}`} />
                  </button>
                  {!addressBook.some(
                    (ab: AddressBookEntryClass) => ab.address === znsAlias && ab.chain === serverChainName,
                  ) && (
                    <button
                      type="button"
                      aria-label="Save as contact"
                      title="Save as contact"
                      onClick={() => {
                        // Save the ALIAS (not the resolved UA) so the contact re-resolves
                        // every time it's used — matches the ZNS philosophy.
                        setAddLabel(new AddressBookEntryClass("", znsAlias));
                        navigate(routes.ADDRESSBOOK);
                      }}
                      style={iconButtonStyle}
                    >
                      <i className={`${"fas"} ${"fa-user-plus"} ${"fa-lg"}`} />
                    </button>
                  )}
                </span>
              ) : contactLabel ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span className={cstyles.green}>Contact: {contactLabel}</span>
                  <button
                    type="button"
                    aria-label="Clear recipient"
                    title="Clear recipient"
                    onClick={clearToAddress}
                    style={iconButtonStyle}
                  >
                    <i className={`${"fas"} ${"fa-times-circle"} ${"fa-lg"}`} />
                  </button>
                </span>
              ) : toLocal && addressIsValid === 1 ? (
                // Valid pasted/typed address that isn't yet in the contacts list —
                // offer to save it. We store the resolved UA verbatim.
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <button
                    type="button"
                    aria-label="Save as contact"
                    title="Save as contact"
                    onClick={() => {
                      setAddLabel(new AddressBookEntryClass("", toLocal));
                      navigate(routes.ADDRESSBOOK);
                    }}
                    style={iconButtonStyle}
                  >
                    <i className={`${"fas"} ${"fa-user-plus"} ${"fa-lg"}`} />
                  </button>
                </span>
              ) : null}
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
        <input
          type="text"
          aria-label="Recipient address"
          placeholder="Unified | Sapling | Transparent | TEX address | name.zcash"
          className={cstyles.inputbox}
          value={toLocal}
          readOnly={!!znsAlias}
          onChange={(e) => {
            setToLocal(e.target.value);
            updateToField(e.target.value, null, null);
          }}
        />

        <Spacer />

        <div className={`${cstyles.well} ${cstyles.flexspacebetween}`}>
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
            <div className={cstyles.flexspacebetween}>
              <input
                type="number"
                aria-label="Amount"
                step="any"
                className={cstyles.inputbox}
                value={isNaN(amountLocal) ? "" : amountLocal}
                onChange={(e) => {
                  setAmountLocal(Number(e.target.value));
                  updateToField(null, e.target.value, null);
                }}
              />
              <button
                type="button"
                aria-label="Set maximum amount"
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
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
            <div className={cstyles.flexspacebetween}>
              <input
                type="number"
                aria-label="Transaction fee"
                step="any"
                className={cstyles.inputbox}
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
            <TextareaAutosize
              className={cstyles.inputbox}
              value={memoLocal}
              disabled={isMemoDisabled}
              onChange={(e) => {
                setMemoLocal(e.target.value);
                updateToField(null, null, e.target.value);
              }}
              minRows={2}
              maxRows={5}
            />
            {toaddr.memoReplyTo && (
              <TextareaAutosize
                className={cstyles.inputbox}
                value={toaddr.memoReplyTo}
                disabled={true}
                minRows={2}
                maxRows={5}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ToAddrBox;
