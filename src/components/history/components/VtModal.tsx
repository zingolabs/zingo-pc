import React, { useContext, useState } from "react";
import Modal from "react-modal";
import dateformat from "dateformat";
import { RouteComponentProps, withRouter } from "react-router";
import { BalanceBlockHighlight } from "../../balanceblock";
import styles from "../History.module.css";
import cstyles from "../../common/Common.module.css";
import { ValueTransfer } from "../../appstate";
import Utils from "../../../utils/utils";
import { ZcashURITarget } from "../../../utils/uris";
import routes from "../../../constants/routes.json";
import { ContextApp } from "../../../context/ContextAppState";
const { clipboard } = window.require("electron");

const { shell } = window.require("electron"); 

type VtModalInternalProps = {
  modalIsOpen: boolean;
  closeModal: () => void;
  vt?: ValueTransfer;
  currencyName: string;
  setSendTo: (targets: ZcashURITarget | ZcashURITarget[]) => void;
  addressBookMap: Map<string, string>;
};

const VtModalInternal: React.FC<RouteComponentProps & VtModalInternalProps> = ({
  modalIsOpen,
  vt,
  closeModal,
  currencyName,
  setSendTo,
  history,
  addressBookMap,
}) => {
  const context = useContext(ContextApp);
  const { readOnly } = context;
  const [expandAddress, setExpandAddress] = useState(false); 
  const [expandTxid, setExpandTxid] = useState(false); 
  
  let txid: string = "";
  let type: 'sent' | 'received' | 'send-to-self' | 'memo-to-self' | 'shield' | "" = ""; 
  let typeIcon: string = "";
  let typeColor: string = "";
  let confirmations: number = 0;
  let address: string = "";
  let memos: string[] = [];
  let pool: 'Orchard' | 'Sapling' | 'Transparent' | "" = "";
  let amount: number = 0;
  let fees: number = 0;
  let datePart: string = "";
  let timePart: string = "";
  let price: number = 0;
  let priceString: string = "";
  let replyTo: string = ""; 

  if (vt) {
    txid = vt.txid;
    type = vt.type;
    if (vt.type === "received" || vt.type === "shield") {
      typeIcon = "fa-arrow-circle-down";
      typeColor = "green";
    } else {
      typeIcon = "fa-arrow-circle-up";
      typeColor = "white";
    }

    datePart = dateformat(vt.time * 1000, "mmm dd, yyyy");
    timePart = dateformat(vt.time * 1000, "hh:MM tt");

    confirmations = vt.confirmations;
    amount = vt.amount;
    fees = vt.fee ? vt.fee : 0;
    address = vt.address;
    memos = vt.memos && vt.memos.length > 0 ? vt.memos : [];
    pool = vt.pool ? vt.pool : '';
    price = vt.zec_price ? vt.zec_price : 0;
    if (price) {
      priceString = `USD ${price.toFixed(2)} / ZEC`;
    }
  }

  const { bigPart, smallPart }: {bigPart: string, smallPart: string} = Utils.splitZecAmountIntoBigSmall(amount);

  const label: string = addressBookMap.get(address) || "";

  const memoTotal = memos ? memos.join('') : '';
  if (memoTotal.includes('\nReply to: \n')) {
    let memoArray = memoTotal.split('\nReply to: \n');
    const memoPoped = memoArray.pop();
    replyTo = memoPoped ? memoPoped.toString() : ''; 
  }


  const openTxid = () => {
    if (currencyName === "TAZ") {
      shell.openExternal(`https://testnet.zcashblockexplorer.com/transactions/${txid}`);
    } else {
      shell.openExternal(`https://zcashblockexplorer.com/transactions/${txid}`);
    }
  };

  const doReply = (address: string) => {
    setSendTo(new ZcashURITarget(address));
    setExpandAddress(false);
    setExpandTxid(false);
    closeModal();

    history.push(routes.SEND);
  };

  const localCloseModal = () => {
    setExpandAddress(false);
    setExpandTxid(false);
    closeModal();
  };

  //console.log(tx);

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
              usdValue={priceString} 
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

          {fees > 0 && (
            <div>
              <div className={[cstyles.sublight].join(" ")}>Fees</div>
              <div>ZEC {Utils.maxPrecisionTrimmed(fees)}</div>
            </div>
          )}

          <div>
            <div className={[cstyles.sublight].join(" ")}>Confirmations</div>
            <div>{confirmations === null ? '-' : confirmations}</div>
          </div>
        </div>

        <div className={cstyles.margintoplarge} />

        <div className={[cstyles.flexspacebetween].join(" ")}>
          {!!txid && ( 
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
                  {!expandTxid && !!txid && Utils.trimToSmall(txid, 10)}
                  {expandTxid && !!txid && (
                    <>
                      {txid.length < 80 ? txid : Utils.splitStringIntoChunks(txid, 3).map(item => <div key={item}>{item}</div>)}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className={cstyles.primarybutton} onClick={openTxid}>
            View TXID &nbsp;
            <i className={["fas", "fa-external-link-square-alt"].join(" ")} />
          </div>
        </div>

        <hr style={{ width: "100%" }} />

            <div key={`${txid}-${address}-${pool}`} className={cstyles.verticalflex}>
              {!!label && (
                <div className={cstyles.highlight} style={{ marginBottom: 5 }}>{label}</div> 
              )}
              {!!address && (
                <>
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
                </>
              )}

              <div className={[cstyles.flexspacebetween].join(" ")}>
                <div className={[cstyles.verticalflex].join(" ")}>
                  <div className={[cstyles.sublight].join(" ")}>Amount</div>
                  <div className={[cstyles.verticalflex].join(" ")}>
                    <div className={[cstyles.verticalflex].join(" ")}>
                      <div>
                        <span>
                          {currencyName} {bigPart}
                        </span>
                        <span className={[cstyles.small, cstyles.zecsmallpart].join(" ")}>{smallPart}</span>
                      </div>
                    </div>
                    <div className={[cstyles.verticalflex].join(" ")}>
                      <div className={[cstyles.sublight].join(" ")}>{priceString}</div>
                    </div>
                  </div>
                </div>

                {pool && (
                  <div className={[cstyles.verticalflex].join(" ")}>
                    <div className={[cstyles.sublight].join(" ")}>Pool</div>
                    <div className={[cstyles.flexspacebetween].join(" ")}>
                      <div>{pool}</div>
                    </div>
                  </div>
                )}
              </div>

              <div className={cstyles.margintoplarge} />

              {memos && memos.length > 0 && (
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
                      {memos.join("")}
                    </div>
                    {!!replyTo && !readOnly && (
                      <div>
                        <div style={{ whiteSpace: 'nowrap' }} className={cstyles.primarybutton} onClick={() => doReply(replyTo)}>
                          Reply to
                        </div>
                        <div />
                      </div>
                    )}
                  </div>
                </div>
              )}

              <hr style={{ width: "100%" }} />

            </div>

        <div className={[cstyles.center, cstyles.margintoplarge].join(" ")}>
          <button type="button" className={cstyles.primarybutton} onClick={localCloseModal}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default withRouter(VtModalInternal);