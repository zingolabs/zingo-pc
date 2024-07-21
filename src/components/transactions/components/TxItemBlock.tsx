import React, { useState } from "react";
import dateformat from "dateformat";
import styles from "../Transactions.module.css";
import cstyles from "../../common/Common.module.css";
import { Transaction } from "../../appstate";
import Utils from "../../../utils/utils";
const { clipboard } = window.require("electron");

type TxItemBlockProps = {
  transaction: Transaction;
  currencyName: string;
  txClicked: (tx: Transaction) => void;
  addressBookMap: Map<string, string>;
  previousLineWithSameTxid: boolean;
};

const TxItemBlock = ({ transaction, currencyName, txClicked, addressBookMap, previousLineWithSameTxid }: TxItemBlockProps) => {
  const [expandAddress, setExpandAddress] = useState(false);
  const [expandTxid, setExpandTxid] = useState(false); 
  
  const txDate: Date = new Date(transaction.time * 1000);
  const datePart: string = dateformat(txDate, "mmm dd, yyyy");
  const timePart: string = dateformat(txDate, "hh:MM tt");

  const fees: number = transaction && transaction.fee ? transaction.fee : 0;
  const amount: number = transaction.amount;
  const label: string | undefined = addressBookMap.get(transaction.address);
  const address: string = transaction.address;
  const txid: string = transaction.txid;
  const memos: string = transaction.memos && transaction.memos.length > 0 ? transaction.memos.join("\n") : "";
  const { bigPart, smallPart }: {bigPart: string, smallPart: string} = Utils.splitZecAmountIntoBigSmall(amount);

  const price: number = transaction.zec_price ? transaction.zec_price : 0;
  let  priceString: string = '';
  if (price) {
    priceString = `USD ${price.toFixed(2)} / ZEC`; 
  }

  return (
    <div>
      {!previousLineWithSameTxid ? (
        <div className={[cstyles.small, cstyles.sublight, styles.txdate].join(" ")}>{datePart}</div>
      ) : (
        <div style={{ marginLeft: 25, marginRight: 25, height: 1, background: 'white', opacity: 0.4 }}></div>
      )}
      <div
        className={[cstyles.well, styles.txbox].join(" ")}
        onClick={() => {
          txClicked(transaction);
        }}
      >
        <div className={styles.txtype} style={{ marginRight: 10 }}>
          <div style={{ color: transaction.confirmations === null || transaction.confirmations === 0 ? 'red' : transaction.type === 'received' || transaction.type === 'shield' ? 'green' : 'white' }}>{transaction.type}</div>
          <div className={[cstyles.padtopsmall, cstyles.sublight].join(" ")}>{timePart}</div>
        </div>
        <div className={styles.txaddressmemofeeamount}>
          <div className={styles.txaddressmemo}>
            <div className={styles.txaddress}>
              {!!label && (
                <div className={cstyles.highlight} style={{ marginBottom: 5 }}>{label}</div> 
              )}
              {!!address ? (
                <div className={[cstyles.verticalflex].join(" ")}>
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
              ) : (
                <div
                  style={{ cursor: "pointer" }}
                  onClick={() => {
                    if (txid) {
                      clipboard.writeText(txid);
                      setExpandTxid(true);
                    }
                  }}>
                  <div style={{ display: 'flex', flexDirection: 'column', flexWrap: 'wrap' }}>
                    {!txid && '-'}
                    {!expandTxid && !!txid && Utils.trimToSmall(txid, 10)}
                    {expandTxid && !!txid && (
                      <>
                        {txid.length < 80 ? txid : Utils.splitStringIntoChunks(txid, 3).map(item => <div key={item}>{item}</div>)}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div
              className={[
                cstyles.small,
                cstyles.sublight,
                cstyles.padtopsmall,
                cstyles.memodiv,
                styles.txmemo,
              ].join(" ")}
            >
              {memos ? memos : null}
            </div>
          </div>
          <div className={[styles.txfeeamount, cstyles.right].join(" ")}>
            {fees > 0 && (
              <div className={[styles.txfee, cstyles.right].join(" ")}> 
                <div>Fees</div>
                <div className={[cstyles.sublight, cstyles.small, cstyles.padtopsmall].join(" ")}>
                  <div>ZEC {Utils.maxPrecisionTrimmed(fees)}</div>
                </div>
              </div>
            )}
            <div className={[styles.txamount, cstyles.right, cstyles.padtopsmall].join(" ")}>
              <div className={cstyles.padtopsmall}>
                <span>
                  {currencyName} {bigPart}
                </span>
                <span className={[cstyles.small, cstyles.zecsmallpart].join(" ")}>{smallPart}</span>
              </div>
              <div className={[cstyles.sublight, cstyles.small, cstyles.padtopsmall].join(" ")}>
                {priceString}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TxItemBlock;