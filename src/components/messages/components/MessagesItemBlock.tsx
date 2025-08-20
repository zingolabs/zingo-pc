import React, { useState } from "react";
import dateformat from "dateformat";
import styles from "../Messages.module.css";
import cstyles from "../../common/Common.module.css";
import { ValueTransferClass, ValueTransferKindEnum } from "../../appstate";
import Utils from "../../../utils/utils";
const { clipboard } = window.require("electron");

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
  previousLineWithSameTxid 
}) => {
  const [expandAddress, setExpandAddress] = useState(false);
  
  const txDate: Date = new Date(vt.time * 1000);
  const datePart: string = dateformat(txDate, "mmm dd, yyyy");
  const timePart: string = dateformat(txDate, "hh:MM tt");

  const amount: number = vt.amount;
  const label: string | undefined = addressBookMap.get(vt.address);
  const address: string = vt.address;
  const memos: string = vt.memos && vt.memos.length > 0 && !!vt.memos.join("") ? vt.memos.join("\n") : "";
  
  const { bigPart, smallPart }: {bigPart: string, smallPart: string} = Utils.splitZecAmountIntoBigSmall(amount);

  return (
    <div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'flex-start',
          padding: 20,
          marginLeft: vt.type === ValueTransferKindEnum.received ? 20 : 100,
          marginRight: vt.type === ValueTransferKindEnum.received ? 100 : 20,
          borderRadius: 20,
          borderBottomRightRadius: vt.type === ValueTransferKindEnum.received ? 20 : 0,
          borderBottomLeftRadius: vt.type === ValueTransferKindEnum.received ? 0 : 20,
          backgroundColor:
            vt.type === ValueTransferKindEnum.received ? Utils.getCssVariable('--color-primary-disable') : Utils.getCssVariable('--color-primary'),

        }}
        className={[cstyles.well, styles.txbox].join(" ")}
        onClick={() => {
          setValueTransferDetail(vt);
          setValueTransferDetailIndex(index);
          setModalIsOpen(true);
        }}
      >
        <div className={styles.txaddressmemo}>
          <div className={styles.txaddress}>
            {!!label && (
              <div style={{ marginBottom: 10, marginLeft: 25, marginTop: -10 }}>{label}</div> 
            )}
            {!!address && !label && (
              <div 
                style={{ marginBottom: 10, marginLeft: 25, marginTop: -10 }}
                className={[cstyles.verticalflex].join(" ")}
              >
                <div
                  style={{ cursor: "pointer" }} 
                  onClick={() => {
                    if (address) {
                      clipboard.writeText(address);
                      setExpandAddress(true);
                    }
                  }}>
                  <div style={{ display: 'flex', flexDirection: 'column', flexWrap: 'wrap' }}>
                    {!address && 'Unknown'}
                    {!expandAddress && !!address && Utils.trimToSmall(address, 10)}
                    {expandAddress && !!address && (
                      <>
                        {address.length < 80 ? address : Utils.splitStringIntoChunks(address, 3).map(item => <div key={item}>{item}</div>)}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
          <div
            className={[
              cstyles.padtopsmall,
              cstyles.memodiv,
              styles.txmemo,
            ].join(" ")}
          >
            {memos ? memos : null}
          </div>
        </div>
      </div>
      <div 
        style={{
          display: 'flex',
          flexDirection: vt.type === ValueTransferKindEnum.received ? 'row' : 'row-reverse', 
          alignItems: 'baseline',
          marginBottom: 15,
          marginTop: 5,
        }} 
        className={[cstyles.horizontalflex].join(" ")}
      >
        {amount >= 0.01 ? (
          <>
            <div 
              style={{ 
                marginLeft: vt.type === ValueTransferKindEnum.received ? 20 : 10, 
                marginRight: vt.type === ValueTransferKindEnum.received ? 10 : 20, 
              }} 
              className={[vt.type === ValueTransferKindEnum.received ? cstyles.highlight : null, styles.txamount].join(" ")}
            >
              <div 
                style={{ alignItems: 'baseline' }} 
                className={[cstyles.padtopsmall, cstyles.horizontalflex].join(" ")}
              >
                <div>{currencyName}{' '}{bigPart}</div>
                <div className={[cstyles.small, cstyles.zecsmallpart].join(" ")}>{smallPart}</div>
              </div>
            </div>
            <div style={{ opacity: 0.4 }} className={[cstyles.horizontalflex].join(" ")} >
              <div className={[].join(" ")}>{datePart + ' ,'}</div>
              <div className={[].join(" ")}>{timePart}</div>
            </div>
          </>
        ) : (
          <div style={{ opacity: 0.4, marginLeft: 20, marginRight: 20 }} className={[cstyles.horizontalflex].join(" ")} >
            <div className={[].join(" ")}>{datePart + ' ,'}</div>
            <div className={[].join(" ")}>{timePart}</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MessagesItemBlock;