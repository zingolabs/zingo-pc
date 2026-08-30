import React, { useState } from "react";
import dateformat from "dateformat";
import styles from "../Messages.module.css";
import cstyles from "../../common/Common.module.css";
import { ValueTransferClass, ValueTransferKindEnum, ValueTransferStatusEnum } from "../../appstate";
import Utils from "../../../utils/utils";
import { useCopy } from "../../common/useCopy";

type MessagesItemBlockProps = {
  index: number;
  vt: ValueTransferClass;
  setValueTransferDetail: (t: ValueTransferClass) => void;
  setValueTransferDetailIndex: (i: number) => void;
  setModalIsOpen: (b: boolean) => void;
  currencyName: string;
  addressBookMap: Map<string, string>;
  previousLineWithSameTxid: boolean;
};

const MessagesItemBlock: React.FC<MessagesItemBlockProps> = ({
  index,
  vt,
  setValueTransferDetail,
  setValueTransferDetailIndex,
  setModalIsOpen,
  currencyName,
  addressBookMap,
  previousLineWithSameTxid,
}) => {
  const [expandAddress, setExpandAddress] = useState(false);
  // 1500ms, the cadence every other inline click-to-copy in the app uses.
  const { copied, copy } = useCopy(1500);

  const txDate: Date = new Date(vt.time * 1000);
  const datePart: string = dateformat(txDate, "mmm dd, yyyy");
  const timePart: string = dateformat(txDate, "hh:MM tt");

  const amount: number = vt.amount;
  const label: string | undefined = vt.address ? addressBookMap.get(vt.address) : undefined;
  const address: string | undefined = vt.address;
  const memos: string = vt.memos && vt.memos.length > 0 && !!vt.memos.join("") ? vt.memos.join("\n") : "";

  const { bigPart, smallPart }: { bigPart: string; smallPart: string } = Utils.splitZecAmountIntoBigSmall(amount);

  // A transaction's USD value uses the price recorded AT tx time, never the
  // current price — applying today's price to an old amount is meaningless.
  // Missing (0) renders `USD --` rather than a wrong figure.
  const price: number = vt.zec_price || 0;

  //if (index === 0) {
  //  vt.status = ValueTransferStatusEnum.failed;
  //  vt.confirmations = 0;
  //  vt.type = ValueTransferKindEnum.sent;
  //}

  //if (index === 1) {
  //  vt.status = ValueTransferStatusEnum.failed;
  //  vt.confirmations = 0;
  //  vt.type = ValueTransferKindEnum.shield;
  //}

  return (
    <div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "flex-start",
          padding: 20,
          marginLeft: vt.type === ValueTransferKindEnum.received ? 20 : 100,
          marginRight: vt.type === ValueTransferKindEnum.received ? 100 : 20,
          borderRadius: 20,
          borderBottomRightRadius: vt.type === ValueTransferKindEnum.received ? 20 : 0,
          borderBottomLeftRadius: vt.type === ValueTransferKindEnum.received ? 0 : 20,
          opacity: vt.status === ValueTransferStatusEnum.failed ? 0.2 : 1,
          backgroundColor:
            vt.type === ValueTransferKindEnum.received
              ? Utils.getCssVariable("--color-primary-disable")
              : Utils.getCssVariable("--color-primary"),
        }}
        role="button"
        tabIndex={0}
        className={`${cstyles.well} ${styles.txbox}`}
        onClick={() => {
          setValueTransferDetail(vt);
          setValueTransferDetailIndex(index);
          setModalIsOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setValueTransferDetail(vt);
            setValueTransferDetailIndex(index);
            setModalIsOpen(true);
          }
        }}
      >
        <div className={styles.txaddressmemo}>
          <div className={styles.txaddress}>
            {!!label && <div style={{ marginBottom: 10, marginLeft: 25, marginTop: -10 }}>{label}</div>}
            {!!address && !label && (
              <div style={{ marginBottom: 10, marginLeft: 25, marginTop: -10 }} className={cstyles.verticalflex}>
                {copied && <span className={cstyles.highlight}>Copied!</span>}
                <button
                  type="button"
                  aria-label="Copy address"
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    color: "inherit",
                    font: "inherit",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    if (address) {
                      copy(address);
                      setExpandAddress(true);
                    }
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", flexWrap: "wrap" }}>
                    {!address && "Unknown"}
                    {!expandAddress && !!address && Utils.trimToSmall(address, 10)}
                    {expandAddress && !!address && (
                      <>
                        {address.length < 80
                          ? address
                          : Utils.splitStringIntoChunks(address, 3).map((item) => <div key={item}>{item}</div>)}
                      </>
                    )}
                  </div>
                </button>
              </div>
            )}
          </div>
          <div className={`${cstyles.padtopsmall} ${cstyles.memodiv} ${styles.txmemo}`}>{memos ? memos : null}</div>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: vt.type === ValueTransferKindEnum.received ? "row" : "row-reverse",
          alignItems: "baseline",
          marginBottom: 15,
          marginTop: 5,
        }}
        className={cstyles.horizontalflex}
      >
        {amount >= 0.01 ? (
          <>
            <div
              style={{
                marginLeft: vt.type === ValueTransferKindEnum.received ? 20 : 10,
                marginRight: vt.type === ValueTransferKindEnum.received ? 10 : 20,
              }}
              className={[vt.type === ValueTransferKindEnum.received ? cstyles.highlight : null, styles.txamount].join(
                " ",
              )}
            >
              <div style={{ alignItems: "baseline" }} className={`${cstyles.padtopsmall} ${cstyles.horizontalflex}`}>
                <div>
                  {currencyName} {bigPart}
                </div>
                <div className={`${cstyles.small} ${cstyles.zecsmallpart}`}>{smallPart}</div>
              </div>
              {currencyName === "ZEC" && (
                <div className={`${cstyles.small} ${cstyles.sublight}`} style={{ marginTop: 2 }}>
                  {Utils.getZecToUsdString(price, amount)}
                </div>
              )}
            </div>
            <div style={{ opacity: 0.4 }} className={cstyles.horizontalflex}>
              <div className={""}>{datePart + " ,"}</div>
              <div className={""}>{timePart}</div>
            </div>
          </>
        ) : (
          <div style={{ opacity: 0.4, marginLeft: 20, marginRight: 20 }} className={cstyles.horizontalflex}>
            <div className={""}>{datePart + " ,"}</div>
            <div className={""}>{timePart}</div>
          </div>
        )}
        {vt.status === ValueTransferStatusEnum.failed && (
          <div style={{ color: Utils.getCssVariable("--color-error"), marginLeft: 10, marginRight: 10 }}>Failed</div>
        )}
      </div>
    </div>
  );
};

export default MessagesItemBlock;
