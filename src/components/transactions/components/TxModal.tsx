import React, { useContext, useState } from "react";
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
import { ContextApp } from "../../../context/ContextAppState";
const { clipboard } = window.require("electron");

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
  const context = useContext(ContextApp);
  const { info } = context;
  const [expandAddress, setExpandAddress] = useState(false); 
  const [expandTxid, setExpandTxid] = useState(false); 
  
  let txid: string = "";
  let type: string = "";
  let typeIcon: string = "";
  let typeColor: string = "";
  let confirmations: number = 0;
  let detailedTxns: TxDetail[] = [];
  let amount: number = 0;
  let datePart: string = "";
  let timePart: string = "";
  let price: number = 0;
  let priceString: string = "";

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
    setSendTo(new ZcashURITarget(address, info.defaultFee));
    setExpandAddress(false);
    setExpandTxid(false);
    closeModal();

    history.push(routes.SEND);
  };

  let fees: number = 0;

  const totalAmounts =
    tx && tx.detailedTxns ? tx.detailedTxns.reduce((s, t: TxDetail) => s + (parseFloat(t.amount) ? parseFloat(t.amount) : 0), 0) : 0;
  // normal case: spend 1600 fee 1000 sent 600
  if (tx && tx.type === 'sent' && tx.amount && Math.abs(tx.amount) > Math.abs(totalAmounts)) {
    fees = Math.abs(tx.amount) - Math.abs(totalAmounts);
  }
  // self-send case: spend 1000 fee 1000 sent 0
  // this is temporary until we have a new field in 'list' object, called: fee.
  if (tx && tx.type === 'sent' && tx.amount && Math.abs(tx.amount) <= Math.abs(totalAmounts)) {
    fees = Math.abs(tx.amount);
  }

  const localCloseModal = () => {
    setExpandAddress(false);
    setExpandTxid(false);
    closeModal();
  };

  //console.log(tx);
  //console.log(tx?.detailedTxns);

  return (
    <Modal
      isOpen={modalIsOpen}
      onRequestClose={localCloseModal}
      className={styles.txmodal}
      overlayClassName={styles.txmodalOverlay}
    >
      <div className={[cstyles.verticalflex].join(" ")}>
        <div className={[cstyles.center].join(" ")}>Transaction Status</div>

        <div className={[cstyles.center, cstyles.horizontalflex].join(" ")} 
             style={{ width: "100%", alignItems: "center", justifyContent: "center" }}>
          <div className={[cstyles.center, cstyles.verticalflex].join(" ")}>
            <i className={["fas", typeIcon].join(" ")} style={{ fontSize: "35px", color: typeColor }} />
            {type}
          </div>

          <div className={[cstyles.center].join(" ")} style={{ marginLeft: 20 }}>
            <BalanceBlockHighlight
              zecValue={amount}
              usdValue={Utils.getZecToUsdString(price, amount)}
              currencyName={currencyName}
            />
          </div>
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
            <div
              style={{ cursor: "pointer" }}
              onClick={() => {
                if (txid) {
                  clipboard.writeText(txid);
                  setExpandTxid(true);
                }
              }}>
              <div style={{ display: 'flex', flexDirection: 'column', flexWrap: 'wrap' }}>
                {!txid && 'Unknown'}
                {!expandTxid && !!txid && Utils.trimToSmall(txid, 10)}
                {expandTxid && !!txid && (
                  <>
                    {txid.length < 80 ? txid : Utils.splitStringIntoChunks(txid, 3).map(item => <div key={item}>{item}</div>)}
                  </>
                )}
              </div>
            </div>
          </div>

          <div className={cstyles.primarybutton} onClick={openTxid}>
            View TXID &nbsp;
            <i className={["fas", "fa-external-link-square-alt"].join(" ")} />
          </div>
        </div>

        <hr style={{ width: "100%" }} />

        {detailedTxns.map((txdetail: TxDetail) => {
          const { bigPart, smallPart }: {bigPart: string, smallPart: string} = Utils.splitZecAmountIntoBigSmall(Math.abs(parseFloat(txdetail.amount)));

          let { address } = txdetail;
          const { memo } = txdetail;

          if (!address) {
            address = "(Shielded)";
          }

          let replyTo: string = "";
          //console.log(memo, tx); 
          if (tx && tx.type === "receive" && memo) {
            const split: string[] = memo.split(/[ :\n\r\t]+/);
            // read the last row & if this is a valid address => show the button up
            //console.log("-", split, "-");
            if (split && split.length > 0) {
              if (!!split[split.length - 1]) {
                replyTo = split[split.length - 1];
              }
            }
          }

          return (
            <div key={address} className={cstyles.verticalflex}>
              <div className={[cstyles.sublight].join(" ")}>Address</div>
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
                    {replyTo && (
                      <div className={cstyles.primarybutton} onClick={() => doReply(replyTo)}>
                        Reply to
                      </div>
                    )}
                  </div>
                </div>
              )}

              <hr style={{ width: "100%" }} />

            </div>
          );
        })}

        <div className={[cstyles.center, cstyles.margintoplarge].join(" ")}>
          <button type="button" className={cstyles.primarybutton} onClick={localCloseModal}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default withRouter(TxModalInternal);