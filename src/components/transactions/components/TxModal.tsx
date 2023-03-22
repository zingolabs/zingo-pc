import React from "react";
import Modal from "react-modal";
import dateformat from "dateformat";
import { RouteComponentProps, withRouter } from "react-router";
import { BalanceBlockHighlight } from "../../balanceblock";
import styles from "../Transactions.module.css";
import cstyles from "../../common/Common.module.css";
import { Transaction, TxDetail } from "../../appstate";
import Utils from "../../../utils/utils";
import { ZcashURITarget } from "../../../utils/uris";
import routes from "../../../constants/routes.json";
import RPC from "../../../rpc/rpc";

const { shell } = window.require("electron"); 

type TxModalInternalProps = {
  modalIsOpen: boolean;
  closeModal: () => void;
  tx?: Transaction;
  currencyName: string;
  setSendTo: (targets: ZcashURITarget | ZcashURITarget[]) => void;
};

const TxModalInternal: React.FC<RouteComponentProps & TxModalInternalProps> = ({
  modalIsOpen,
  tx,
  closeModal,
  currencyName,
  setSendTo,
  history,
}) => {
  let txid = "";
  let type = "";
  let typeIcon = "";
  let typeColor = "";
  let confirmations = 0;
  let detailedTxns: TxDetail[] = [];
  let amount = 0;
  let datePart = "";
  let timePart = "";
  let price = 0;
  let priceString = "";

  if (tx) {
    txid = tx.txid;
    type = tx.type;
    if (tx.type === "receive") {
      typeIcon = "fa-arrow-circle-down";
      typeColor = "green";
    } else {
      typeIcon = "fa-arrow-circle-up";
      typeColor = "red";
    }

    datePart = dateformat(tx.time * 1000, "mmm dd, yyyy");
    timePart = dateformat(tx.time * 1000, "hh:MM tt");

    confirmations = tx.confirmations;
    detailedTxns = tx.detailedTxns;
    amount = Math.abs(tx.amount);
    price = tx.zecPrice;
    if (price) {
      priceString = `USD ${price.toFixed(2)} / ZEC`;
    }
  }

  const openTxid = () => {
    if (currencyName === "TAZ") {
      shell.openExternal(`https://chain.so/tx/ZECTEST/${txid}`);
    } else {
      //shell.openExternal(`https://zcha.in/transactions/${txid}`);
      // Looks like zcha.in isn't working properly, use zecblockexplorer instead
      shell.openExternal(`https://zecblockexplorer.com/tx/${txid}`);
    }
  };

  const doReply = (address: string) => {
    const defaultFee = RPC.getDefaultFee();
    setSendTo(new ZcashURITarget(address, defaultFee));
    closeModal();

    history.push(routes.SEND);
  };

  const totalAmounts =
    tx && tx.detailedTxns ? tx.detailedTxns.reduce((s, t) => Math.abs(parseFloat(t.amount)) + s, 0) : 0;
  const fees = tx ? Math.abs(tx.amount) - totalAmounts : 0;

  return (
    <Modal
      isOpen={modalIsOpen}
      onRequestClose={closeModal}
      className={styles.txmodal}
      overlayClassName={styles.txmodalOverlay}
    >
      <div className={[cstyles.verticalflex].join(" ")}>
        <div className={[cstyles.marginbottomlarge, cstyles.center].join(" ")}>Transaction Status</div>

        <div className={[cstyles.center].join(" ")}>
          <i className={["fas", typeIcon].join(" ")} style={{ fontSize: "96px", color: typeColor }} />
        </div>

        <div className={[cstyles.center].join(" ")}>
          {type}
          <BalanceBlockHighlight
            zecValue={amount}
            usdValue={Utils.getZecToUsdString(price, Math.abs(amount))}
            currencyName={currencyName}
          />
        </div>

        <div className={[cstyles.flexspacebetween].join(" ")}>
          <div>
            <div className={[cstyles.sublight].join(" ")}>Time</div>
            <div>
              {datePart} {timePart}
            </div>
          </div>

          {type === "sent" && (
            <div>
              <div className={[cstyles.sublight].join(" ")}>Fees</div>
              <div>ZEC {Utils.maxPrecisionTrimmed(fees)}</div>
            </div>
          )}

          <div>
            <div className={[cstyles.sublight].join(" ")}>Confirmations</div>
            <div>{confirmations}</div>
          </div>
        </div>

        <div className={cstyles.margintoplarge} />

        <div className={[cstyles.flexspacebetween].join(" ")}>
          <div>
            <div className={[cstyles.sublight].join(" ")}>TXID</div>
            <div>{txid}</div>
          </div>

          <div className={cstyles.primarybutton} onClick={openTxid}>
            View TXID &nbsp;
            <i className={["fas", "fa-external-link-square-alt"].join(" ")} />
          </div>
        </div>

        <div className={cstyles.margintoplarge} />
        <hr />

        {detailedTxns.map((txdetail) => {
          const { bigPart, smallPart } = Utils.splitZecAmountIntoBigSmall(Math.abs(parseFloat(txdetail.amount)));

          let { address } = txdetail;
          const { memo } = txdetail;

          if (!address) {
            address = "(Shielded)";
          }

          let replyTo: string = "";
          if (tx && tx.type === "receive" && memo) {
            const split = memo.split(/[ :\n\r\t]+/);
            if (split && split.length > 0 && Utils.isSapling(split[split.length - 1])) {
              replyTo = split[split.length - 1];
            }
          }

          return (
            <div key={address} className={cstyles.verticalflex}>
              <div className={[cstyles.sublight].join(" ")}>Address</div>
              <div className={[cstyles.verticalflex].join(" ")}>
                {address.length < 80 ? address : Utils.splitStringIntoChunks(address, 3).map(item => <div key={item}>{item}</div>)}
              </div>

              <div className={cstyles.margintoplarge} />

              <div className={[cstyles.sublight].join(" ")}>Amount</div>
              <div className={[cstyles.flexspacebetween].join(" ")}>
                <div className={[cstyles.verticalflex].join(" ")}>
                  <div>
                    <span>
                      {currencyName} {bigPart}
                    </span>
                    <span className={[cstyles.small, cstyles.zecsmallpart].join(" ")}>{smallPart}</span>
                  </div>
                  <div>{Utils.getZecToUsdString(price, Math.abs(amount))}</div>
                </div>
                <div className={[cstyles.verticalflex, cstyles.margintoplarge].join(" ")}>
                  <div className={[cstyles.sublight].join(" ")}>{priceString}</div>
                </div>
              </div>

              <div className={cstyles.margintoplarge} />

              {memo && (
                <div>
                  <div className={[cstyles.sublight].join(" ")}>Memo</div>
                  <div className={[cstyles.flexspacebetween].join(" ")}>
                    <div className={[cstyles.memodiv].join(" ")}>{memo}</div>
                    {replyTo && (
                      <div className={cstyles.primarybutton} onClick={() => doReply(replyTo)}>
                        Reply
                      </div>
                    )}
                  </div>
                </div>
              )}

              <hr />
            </div>
          );
        })}

        <div className={[cstyles.center, cstyles.margintoplarge].join(" ")}>
          <button type="button" className={cstyles.primarybutton} onClick={closeModal}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default withRouter(TxModalInternal);