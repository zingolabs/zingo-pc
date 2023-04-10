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

    const isLoadMoreEnabled = transactions && numTxnsToShow < transactions.length;

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
              zecValue={totalBalance.uabalance}
              usdValue={Utils.getZecToUsdString(info.zecPrice, totalBalance.uabalance)}
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

        <div className={[cstyles.xlarge, cstyles.marginnegativetitle, cstyles.center].join(" ")}>Transactions</div>

        {/* Change the hardcoded height */}
        <ScrollPane offsetHeight={180}>
          {
            /* If no transactions, show the "loading..." text */
            !transactions && <div className={[cstyles.center, cstyles.margintoplarge].join(" ")}>Loading...</div>
          }

          {transactions && transactions.length === 0 && (
            <div className={[cstyles.center, cstyles.margintoplarge].join(" ")}>No Transactions Yet</div>
          )}
          {transactions &&
            transactions.slice(0, numTxnsToShow).map((t: Transaction) => {
              const key = t.type + t.txid + (t.position || "");
              return (
                <TxItemBlock
                  key={key}
                  transaction={t}
                  currencyName={info.currencyName}
                  zecPrice={info.zecPrice}
                  txClicked={this.txClicked}
                  addressBookMap={addressBookMap}
                />
              );
            })}

          {isLoadMoreEnabled && (
            <div
              style={{ marginLeft: "45%", width: "100px" }}
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
        />
      </div>
    );
  }
}
