import React, { Component } from "react";
import cstyles from "../common/Common.module.css";
import styles from "./Transactions.module.css";
import { Transaction, AddressBookEntry } from "../appstate";
import ScrollPane from "../scrollPane/ScrollPane";
import { ZcashURITarget } from "../../utils/uris";
import TxItemBlock from "./components/TxItemBlock";
import TxModal from "./components/TxModal";
import { BalanceBlock, BalanceBlockHighlight } from "../balanceblock";
import Utils from "../../utils/utils";
import { ContextApp } from "../../context/ContextAppState";

type TransactionsProps = {
  setSendTo: (targets: ZcashURITarget[] | ZcashURITarget) => void;
};

type TransactionsState = {
  clickedTx?: Transaction;
  modalIsOpen: boolean;
  numTxnsToShow: number;
};

export default class Transactions extends Component<TransactionsProps, TransactionsState> {
  static contextType = ContextApp;
  constructor(props: TransactionsProps) {
    super(props);

    this.state = { clickedTx: undefined, modalIsOpen: false, numTxnsToShow: 100 };
  }

  txClicked = (tx: Transaction) => {
    // Show the modal
    if (!tx) return;
    this.setState({ clickedTx: tx, modalIsOpen: true });
  };

  closeModal = () => {
    this.setState({ clickedTx: undefined, modalIsOpen: false });
  };

  show100MoreTxns = () => {
    const { numTxnsToShow } = this.state;

    this.setState({ numTxnsToShow: numTxnsToShow + 100 });
  };

  render() {
    const { setSendTo } = this.props;
    const { transactions, info, addressBook, totalBalance } = this.context;
    const { clickedTx, modalIsOpen, numTxnsToShow } = this.state;

    const isLoadMoreEnabled: boolean = transactions && numTxnsToShow < transactions.length;

    const transactionsSorted: Transaction[] = transactions
    .sort((a: any, b: any) => {
      const timeComparison = b.time - a.time;
      if (timeComparison === 0) {
        // same time
        const txidComparison = a.txid.localeCompare(b.txid);
        if (txidComparison === 0) {
          // same txid
          const aAddress = a.address?.toString() || '';
          const bAddress = b.address?.toString() || '';
          const addressComparison = aAddress.localeCompare(bAddress);
          if (addressComparison === 0) {
            // same address
            const aPoolType = a.poolType?.toString() || '';
            const bPoolType = b.poolType?.toString() || '';
            // last one sort criteria - poolType.
            return aPoolType.localeCompare(bPoolType);
          } else {
            // different address
            return addressComparison;
          }
        } else {
          // different txid
          return txidComparison;
        }
      } else {
        // different time
        return timeComparison;
      }
    })
    .slice(0, numTxnsToShow);

    const addressBookMap: Map<string, string> = addressBook.reduce((m: Map<string, string>, obj: AddressBookEntry) => {
      m.set(obj.address, obj.label);
      return m; 
    }, new Map());

    return (
      <div>
        <div className={[cstyles.well, styles.containermargin].join(" ")}>
          <div className={cstyles.balancebox}>
            <BalanceBlockHighlight
              topLabel="All Funds"
              zecValue={totalBalance.total}
              usdValue={Utils.getZecToUsdString(info.zecPrice, totalBalance.total)}
              currencyName={info.currencyName}
            />
            <BalanceBlock
              topLabel="Orchard"
              zecValue={totalBalance.obalance}
              usdValue={Utils.getZecToUsdString(info.zecPrice, totalBalance.obalance)}
              currencyName={info.currencyName}
            />
            <BalanceBlock
              topLabel="Sapling"
              zecValue={totalBalance.zbalance}
              usdValue={Utils.getZecToUsdString(info.zecPrice, totalBalance.zbalance)}
              currencyName={info.currencyName}
            />
            <BalanceBlock
              topLabel="Transparent"
              zecValue={totalBalance.transparent}
              usdValue={Utils.getZecToUsdString(info.zecPrice, totalBalance.transparent)}
              currencyName={info.currencyName}
            />
          </div>
        </div>

        <div style={{ marginBottom: 5 }} className={[cstyles.xlarge, cstyles.marginnegativetitle, cstyles.center].join(" ")}>Transactions</div>

        {/* Change the hardcoded height */}
        <ScrollPane offsetHeight={180}>
          {!transactionsSorted && (
            <div className={[cstyles.center, cstyles.margintoplarge].join(" ")}>Loading...</div>
          )}

          {transactionsSorted && transactionsSorted.length === 0 && (
            <div className={[cstyles.center, cstyles.margintoplarge].join(" ")}>No Transactions Yet</div>
          )}

          {transactionsSorted && transactionsSorted.length > 0 &&
            transactionsSorted.map((t: Transaction, index: number) => {
              const key: string = `${index}-${t.type}-${t.txid}`;
              return (
                <TxItemBlock
                  key={key}
                  transaction={t}
                  currencyName={info.currencyName}
                  txClicked={this.txClicked}
                  addressBookMap={addressBookMap}
                  previousLineWithSameTxid={
                    index === 0 
                      ? false 
                      : (transactionsSorted[index - 1].txid === t.txid)
                  }
                />
              );
            })}

          {isLoadMoreEnabled && (
            <div
              style={{ marginLeft: "45%", width: "100px", marginTop: 15 }}
              className={cstyles.primarybutton}
              onClick={this.show100MoreTxns}
            >
              Load more
            </div>
          )}
        </ScrollPane>

        <TxModal
          modalIsOpen={modalIsOpen}
          tx={clickedTx}
          closeModal={this.closeModal}
          currencyName={info.currencyName}
          setSendTo={setSendTo}
          addressBookMap={addressBookMap}
        />
      </div>
    );
  }
}
