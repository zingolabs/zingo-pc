import React, { useEffect, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";
import styles from "../Send.module.css";
import cstyles from "../../common/Common.module.css";
import {
  AddressType,
  ToAddr,
} from "../../appstate";
import Utils from "../../../utils/utils";
import ArrowUpLight from "../../../assets/img/arrow_up_dark.png";

const Spacer = () => {
  return <div style={{ marginTop: "24px" }} />;
};

type ToAddrBoxProps = {
  toaddr: ToAddr;
  zecPrice: number;
  updateToField: (
    id: number,
    address: string | null,
    amount: string | null,
    memo: string | null,
    memoReplyTo: string | null
  ) => void;
  fromAddress: string;
  fromAmount: number;
  setSendButtonEnabled: (sendButtonEnabled: boolean) => void;
  setMaxAmount: (id: number, total: number) => void;
  totalAmountAvailable: number;
};

const ToAddrBox = ({
  toaddr,
  zecPrice,
  updateToField,
  fromAddress,
  fromAmount,
  setMaxAmount,
  setSendButtonEnabled,
  totalAmountAvailable,
}: ToAddrBoxProps) => {
  const [addressType, setAddressType] = useState<AddressType>();
  const [isMemoDisabled, setIsMemoDisabled] = useState<boolean>(false);
  const [addressIsValid, setAddressIsValid] = useState<boolean>(true);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [usdValue, setUsdValue] = useState<string>('');

  useEffect(() => {
    (async () => {
      const addressType: AddressType | undefined = await Utils.getAddressType(toaddr.to);
      setAddressType(addressType);
      const isMemoDisabled: boolean = !(addressType === AddressType.sapling || addressType === AddressType.unified);
      setIsMemoDisabled(isMemoDisabled);
    
      const addressIsValid: boolean =
        toaddr.to === "" || addressType !== undefined;
      setAddressIsValid(addressIsValid);
    
      let amountError: string | null = null;
      if (toaddr.amount) {
        if (toaddr.amount < 0) {
          amountError = "Amount cannot be negative";
        }
        if (toaddr.amount > fromAmount) {
          amountError = "Amount Exceeds Balance";
        }
        if (toaddr.amount < 10 ** -8) {
          amountError = "Amount is too small";
        }
        const s = toaddr.amount.toString().split(".");
        if (s && s.length > 1 && s[1].length > 8) {
          amountError = "Too Many Decimals";
        }
      }
    
      if (isNaN(toaddr.amount)) {
        // Amount is empty
        amountError = "Amount cannot be empty";
      }
      setAmountError(amountError);
    
      let buttonstate: boolean = true;
      if (!addressIsValid || amountError || toaddr.to === "" || totalAmountAvailable < 0) {
        buttonstate = false;
      }
    
      setTimeout(() => {
        setSendButtonEnabled(buttonstate);
      }, 10);
    
      const usdValue: string = Utils.getZecToUsdString(zecPrice, toaddr.amount);
      setUsdValue(usdValue);
    })();
  }, [fromAmount, setSendButtonEnabled, toaddr.amount, toaddr.to, totalAmountAvailable, zecPrice]);
  
  const addReplyTo = (checked: boolean) => {
    if (toaddr.id) {
      if (fromAddress && checked) {
        updateToField(toaddr.id, null, null, null, `\nReply to: \n${fromAddress}`);
      } else {
        updateToField(toaddr.id, null, null, null, "");
      }
    }
  };

  return (
    <div>
      <div className={[cstyles.well, cstyles.verticalflex].join(" ")}>
        <div className={[cstyles.flexspacebetween].join(" ")}>
          <div className={cstyles.sublight}>To</div>
            <div className={[cstyles.sublight, cstyles.green].join(" ")}>
                {addressType !== undefined && addressType === AddressType.sapling && 'Sapling'}
                {addressType !== undefined && addressType === AddressType.transparent && 'Transparent'}
                {addressType !== undefined && addressType === AddressType.unified && 'Unified'}
              </div>
            <div className={cstyles.validationerror}>
            {addressIsValid ? (
              <i className={[cstyles.green, "fas", "fa-check"].join(" ")} />
            ) : (
              <span className={cstyles.red}>Invalid Address</span>
            )}
          </div>
        </div>
        <input
          type="text"
          placeholder="Unified | Sapling | Transparent address"
          className={cstyles.inputbox}
          value={toaddr.to}
          onChange={(e) => updateToField(toaddr.id as number, e.target.value, null, null, null)}
        />
        <Spacer />
        <div className={[cstyles.flexspacebetween].join(" ")}>
          <div className={cstyles.sublight}>Amount</div>
          <div className={cstyles.validationerror}>
            {amountError ? <span className={cstyles.red}>{amountError}</span> : <span>{usdValue}</span>}
          </div>
        </div>
        <div className={[cstyles.flexspacebetween].join(" ")}>
          <input
            type="number"
            step="any"
            className={cstyles.inputbox}
            value={isNaN(toaddr.amount) ? "" : toaddr.amount}
            onChange={(e) => updateToField(toaddr.id as number, null, e.target.value, null, null)}
          />
          <img
            className={styles.toaddrbutton}
            src={ArrowUpLight}
            alt="Max"
            onClick={() => setMaxAmount(toaddr.id as number, fromAmount)}
          />
        </div>

        <Spacer />

        {isMemoDisabled && <div className={cstyles.sublight}>Memos only for Unified or Sapling addresses</div>}

        {!isMemoDisabled && (
          <div>
            <div className={[cstyles.flexspacebetween].join(" ")}>
              <div className={cstyles.sublight}>Memo</div>
              <div className={cstyles.validationerror}>{toaddr.memo.length}</div>
            </div>
            <TextareaAutosize
              className={[toaddr.memoReplyTo ? cstyles.inputboxmemo : cstyles.inputbox].join(" ")}
              value={toaddr.memo}
              disabled={isMemoDisabled}
              onChange={(e) => updateToField(toaddr.id as number, null, null, e.target.value, null)}
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
            <input style={{ marginTop: 5 }} type="checkbox" onChange={(e) => addReplyTo(e.target.checked)} />
            Include Reply to Unified address
          </div>
        )}
      </div>
    </div>
  );
}; 

export default ToAddrBox;