import React from "react";
import dateformat from "dateformat";
import styles from "../Transactions.module.css";
import cstyles from "../../common/Common.module.css";
import { Transaction } from "../../appstate";
import Utils from "../../../utils/utils";

type TxItemBlockProps = {
  transaction: Transaction;
  currencyName: string;
  zecPrice: number;
  txClicked: (tx: Transaction) => void;
  addressBookMap: Map<string, string>;
};

const TxItemBlock = ({ transaction, currencyName, zecPrice, txClicked, addressBookMap }: TxItemBlockProps) => {
  const txDate = new Date(transaction.time * 1000);
  const datePart = dateformat(txDate, "mmm dd, yyyy");
  const timePart = dateformat(txDate, "hh:MM tt");

  return (
    <div>
      <div className={[cstyles.small, cstyles.sublight, styles.txdate].join(" ")}>{datePart}</div>
      <div
        className={[cstyles.well, styles.txbox].join(" ")}
        onClick={() => {
          txClicked(transaction);
        }}
      >
        <div className={styles.txtype}>
          <div>{transaction.type}</div>
          <div className={[cstyles.padtopsmall, cstyles.sublight].join(" ")}>{timePart}</div>
        </div>
        <div className={styles.txaddressamount}>
          {transaction.detailedTxns.map((txdetail) => {
            const { bigPart, smallPart } = Utils.splitZecAmountIntoBigSmall(Math.abs(parseFloat(txdetail.amount)));

            let { address } = txdetail;
            const { memo } = txdetail;

            if (!address) {
              address = "(Shielded)";
            }

            const label = addressBookMap.get(address) || "";

            return (
              <div key={address} className={cstyles.padtopsmall}>
                <div className={styles.txaddress}>
                  <div className={cstyles.highlight}>{label}</div>
                  <div className={[cstyles.verticalflex].join(" ")}>
                    {address.length < 80 ? address : Utils.splitStringIntoChunks(address, 3).map(item => <div key={item}>{item}</div>)}
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
                    {memo}
                  </div>
                </div>
                <div className={[styles.txamount, cstyles.right].join(" ")}>
                  <div>
                    <span>
                      {currencyName} {bigPart}
                    </span>
                    <span className={[cstyles.small, cstyles.zecsmallpart].join(" ")}>{smallPart}</span>
                  </div>
                  <div className={[cstyles.sublight, cstyles.small, cstyles.padtopsmall].join(" ")}>
                    {Utils.getZecToUsdString(zecPrice, Math.abs(parseFloat(txdetail.amount)))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default TxItemBlock;