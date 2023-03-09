import React, { Component } from "react";
import cstyles from "./Common.module.css";
import { Transaction, Info, AddressBookEntry } from "../appstate";
import ScrollPane from "../scrollPane/ScrollPane";
import { ZcashURITarget } from "../../utils/uris";
import TxItemBlock from "./components/TxItemBlock";
import TxModal from "./components/TxModal";

type TransactionsProps = {
  transactions: Transaction[];
  addressBook: AddressBookEntry[];
  info: Info;
  setSendTo: (targets: ZcashURITarget[] | ZcashURITarget) => void;
};

type TransactionsState = {
  clickedTx?: Transaction;
  modalIsOpen: boolean;
  numTxnsToShow: number;
};

export default class Transactions extends Component<TransactionsProps, TransactionsState> {
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
    const { transactions, info, addressBook, setSendTo } = this.props;
    const { clickedTx, modalIsOpen, numTxnsToShow } = this.state;

    const isLoadMoreEnabled = transactions && numTxnsToShow < transactions.length;

    const addressBookMap: Map<string, string> = addressBook.reduce((m, obj) => {
      m.set(obj.address, obj.label);
      return m;
    }, new Map());

    return (
      <div>
        <div className={[cstyles.xlarge, cstyles.padall, cstyles.center].join(" ")}>Transactions</div>

        {/* Change the hardcoded height */}
        <ScrollPane offsetHeight={100}>
          {
            /* If no transactions, show the "loading..." text */
            !transactions && <div className={[cstyles.center, cstyles.margintoplarge].join(" ")}>Loading...</div>
          }

          {transactions && transactions.length === 0 && (
            <div className={[cstyles.center, cstyles.margintoplarge].join(" ")}>No Transactions Yet</div>
          )}
          {transactions &&
            transactions.slice(0, numTxnsToShow).map((t) => {
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
