import React, { useContext, useEffect, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";
import styles from "../Send.module.css";
import cstyles from "../../common/Common.module.css";
import {
  AddressBookEntryClass,
  AddressKindEnum,
  ServerChainNameEnum,
  ToAddrClass,
} from "../../appstate";
import Utils from "../../../utils/utils";
import ArrowUpLight from "../../../assets/img/arrow_up_dark.png";
import { ContextApp } from "../../../context/ContextAppState";

const Spacer = () => {
  return <div style={{ marginTop: "24px" }} />;
};

type ToAddrBoxProps = {
  toaddr: ToAddrClass;
  zecPrice: number;
  updateToField: (
    address: string | null,
    amount: string | null,
    memo: string | null,
  ) => void;
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
  const { addressBook } = context;

  const [toLocal, setToLocal] = useState<string>(toaddr.to);
  const [amountLocal, setAmountLocal] = useState<number>(toaddr.amount);
  const [memoLocal, setMemoLocal] = useState<string>(toaddr.memo);

  const [addressKind, setAddressKind] = useState<AddressKindEnum>();
  const [isMemoDisabled, setIsMemoDisabled] = useState<boolean>(false);
  const [addressIsValid, setAddressIsValid] = useState<number>(0);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [usdValue, setUsdValue] = useState<string>('');
  const [memoError, setMemoError] = useState<string | null>(null);

  useEffect(() => {
    setToLocal(toaddr.to);
    setAmountLocal(toaddr.amount);
    setMemoLocal(toaddr.memo);
  }, [toaddr.to, toaddr.amount, toaddr.memo]);
  
  useEffect(() => {
    (async () => {
      const _addressKind: AddressKindEnum | undefined = await Utils.getAddressKind(toLocal, serverChainName);
      setAddressKind(_addressKind);
      const _isMemoDisabled: boolean = !(_addressKind === AddressKindEnum.sapling || _addressKind === AddressKindEnum.unified);
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
          setSendFeeError('');
          setTotalAmountAvailable(fromAmountDefault);
        }
      }
    
      let buttonstate: boolean = true;
      if (_addressIsValid === -1 || _amountError || _memoError || toLocal === "" || fromAmount < 0 || sendFee <= 0 || sendFeeError) {
        buttonstate = false;
      }
    
      setTimeout(() => {
        setSendButtonEnabled(buttonstate);
      }, 10);
    
      const usdValue: string = Utils.getZecToUsdString(zecPrice, amountLocal);
      setUsdValue(usdValue);
    })();
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

  const getLabelAddressBook = (addr: string) => {
    if (!addr) {
      return "";
    }
    // Find the addr in addresses
    const label: AddressBookEntryClass | undefined = addressBook.find((ab: AddressBookEntryClass) => ab.address === addr);
    const labelStr: string = label ? ` [ ${label.label} ]` : "";

    return labelStr; 
  };

  
  //console.log(sendFeeError);

  return ( 
    <div>
      <div className={[cstyles.well, cstyles.verticalflex].join(" ")}>
        <div style={{ marginBottom: 5 }} className={[cstyles.flexspacebetween].join(" ")}>
          <div className={cstyles.horizontalflex}>
            <div className={cstyles.sublight}>To </div>
            <div style={{ fontWeight: 900, marginLeft: 20 }}>{getLabelAddressBook(toLocal)}</div>
          </div>
          <div className={[cstyles.sublight, cstyles.green].join(" ")}>
            {addressKind !== undefined && addressKind === AddressKindEnum.tex && 'TEX'}
            {addressKind !== undefined && addressKind === AddressKindEnum.transparent && 'Transparent'}
            {addressKind !== undefined && addressKind === AddressKindEnum.sapling && 'Sapling'}
            {addressKind !== undefined && addressKind === AddressKindEnum.unified && 'Unified'}
          </div>
          <div className={cstyles.validationerror}>
            {addressIsValid === 1 && (
              <i className={[cstyles.green, "fas", "fa-check"].join(" ")} />
            )}
            {addressIsValid === -1 && (
              <span className={cstyles.red}>Invalid Address</span>
            )}
          </div>
        </div>
        <input
          type="text"
          placeholder="Unified | Sapling | Transparent | TEX address"
          className={cstyles.inputbox}
          value={toLocal}
          onChange={(e) => {
            setToLocal(e.target.value);
            updateToField(e.target.value, null, null);
          }}
        />

        <Spacer />

        <div className={[cstyles.well, cstyles.flexspacebetween].join(" ")}>
          <div style={{ width: '60%' }} className={[cstyles.verticalflex].join(" ")}>
            <div style={{ marginBottom: 5 }} className={[cstyles.flexspacebetween].join(" ")}>
              <div className={cstyles.sublight}>Amount</div>
              <div className={cstyles.validationerror}>
                {amountError ? <span className={cstyles.red}>{amountError}</span> : currencyName === 'ZEC' ? <span>{usdValue}</span> : null}
              </div>
            </div>
            <div className={[cstyles.flexspacebetween].join(" ")}>
              <input
                type="number"
                step="any"
                className={cstyles.inputbox}
                value={isNaN(amountLocal) ? "" : amountLocal}
                onChange={(e) => {
                  setAmountLocal(Number(e.target.value));
                  updateToField(null, e.target.value, null);
                }}
              />
              <img
                className={styles.toaddrbutton}
                src={ArrowUpLight}
                alt="Max"
                onClick={() => setMaxAmount(fromAmount)}
              />
            </div>
          </div>
          <div style={{ width: '30%' }} className={[cstyles.verticalflex].join(" ")}>
            <div style={{ marginBottom: 5 }} className={[cstyles.horizontalflex].join(" ")}>
              <div style={{ color: sendFeeError && !amountError && addressIsValid ? Utils.getCssVariable('--color-error') : Utils.getCssVariable('--color-text') }} className={cstyles.sublight}>Fee</div>
              <div style={{ paddingTop: 3, paddingLeft: 10 }} title={sendFeeError}>
                <div className={[cstyles.small].join(" ")}>
                  {sendFeeError && !amountError && addressIsValid !== -1 && (
                    <span>
                      &nbsp;
                      <i className={[cstyles.red, "fas", "fa-info-circle"].join(" ")} />
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className={[cstyles.flexspacebetween].join(" ")}>
              <input
                type="number"
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
            <div style={{ marginBottom: 5 }} className={[cstyles.flexspacebetween].join(" ")}>
              <div className={cstyles.sublight}>Memo</div>
              <div className={cstyles.validationerror}>
                {memoError 
                  ? <span className={cstyles.red}>{memoError + '. ' + (memoLocal + toaddr.memoReplyTo).length }</span> 
                  : <span>{(memoLocal + toaddr.memoReplyTo).length}</span>}
              </div>
            </div>
            <TextareaAutosize
              className={[cstyles.inputbox].join(" ")}
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
                className={[cstyles.inputbox].join(" ")}
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