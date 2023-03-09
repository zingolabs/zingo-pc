import React from "react";
import TextareaAutosize from "react-textarea-autosize";
import styles from "./Send.module.css";
import cstyles from "./Common.module.css";
import {
  ToAddr,
} from "../../appstate";
import Utils from "../../../utils/utils";
import ArrowUpLight from "../assets/img/arrow_up_dark.png";

const Spacer = () => {
  return <div style={{ marginTop: "24px" }} />;
};

type ToAddrBoxProps = {
  toaddr: ToAddr;
  zecPrice: number;
  updateToField: (
    id: number,
    address: React.ChangeEvent<HTMLInputElement> | null,
    amount: React.ChangeEvent<HTMLInputElement> | null,
    memo: React.ChangeEvent<HTMLTextAreaElement> | string | null
  ) => void;
  fromAddress: string;
  fromAmount: number;
  setSendButtonEnable: (sendButtonEnabled: boolean) => void;
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
  setSendButtonEnable,
  totalAmountAvailable,
}: ToAddrBoxProps) => {
  const isMemoDisabled = !(Utils.isZaddr(toaddr.to) || Utils.isUnified(toaddr.to));

  const addressIsValid =
    toaddr.to === "" || Utils.isUnified(toaddr.to) || Utils.isZaddr(toaddr.to) || Utils.isTransparent(toaddr.to);

  let amountError = null;
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

  let buttonstate = true;
  if (!addressIsValid || amountError || toaddr.to === "" || toaddr.amount === 0 || fromAmount === 0) {
    buttonstate = false;
  }

  setTimeout(() => {
    setSendButtonEnable(buttonstate);
  }, 10);

  const usdValue = Utils.getZecToUsdString(zecPrice, toaddr.amount);

  const addReplyTo = () => {
    if (toaddr.memo.endsWith(fromAddress)) {
      return;
    }

    if (fromAddress && toaddr.id) {
      updateToField(toaddr.id, null, null, `${toaddr.memo}\nReply-To:\n${fromAddress}`);
    }
  };

  return (
    <div>
      <div className={[cstyles.well, cstyles.verticalflex].join(" ")}>
        <div className={[cstyles.flexspacebetween].join(" ")}>
          <div className={cstyles.sublight}>To</div>
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
          placeholder="U | Z | T address"
          className={cstyles.inputbox}
          value={toaddr.to}
          onChange={(e) => updateToField(toaddr.id as number, e, null, null)}
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
            onChange={(e) => updateToField(toaddr.id as number, null, e, null)}
          />
          <img
            className={styles.toaddrbutton}
            src={ArrowUpLight}
            alt="Max"
            onClick={() => setMaxAmount(toaddr.id as number, totalAmountAvailable)}
          />
        </div>

        <Spacer />

        {isMemoDisabled && <div className={cstyles.sublight}>Memos only for sapling or UA addresses</div>}

        {!isMemoDisabled && (
          <div>
            <div className={[cstyles.flexspacebetween].join(" ")}>
              <div className={cstyles.sublight}>Memo</div>
              <div className={cstyles.validationerror}>{toaddr.memo.length}</div>
            </div>
            <TextareaAutosize
              className={cstyles.inputbox}
              value={toaddr.memo}
              disabled={isMemoDisabled}
              onChange={(e) => updateToField(toaddr.id as number, null, null, e)}
            />
            <input type="checkbox" onChange={(e) => e.target.checked && addReplyTo()} />
            Include Reply-To address
          </div>
        )}
        <Spacer />
      </div>
      <Spacer />
    </div>
  );
};

export default ToAddrBox;