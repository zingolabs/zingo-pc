import React, { useContext, useState } from "react";
import Modal from "react-modal";
import dateformat from "dateformat";
import { RouteComponentProps, withRouter } from "react-router";
import { BalanceBlockHighlight } from "../../balanceblock";
import styles from "../History.module.css";
import cstyles from "../../common/Common.module.css";
import { Address, AddressBookEntry, ValueTransfer } from "../../appstate";
import Utils from "../../../utils/utils";
import { ZcashURITarget } from "../../../utils/uris";
import routes from "../../../constants/routes.json";
import { ContextApp } from "../../../context/ContextAppState";
const { clipboard } = window.require("electron");

const { shell } = window.require("electron"); 

type VtModalInternalProps = {
  index: number;
  length: number;
  totalLength: number;
  vt?: ValueTransfer;
  modalIsOpen: boolean;
  closeModal: () => void;
  currencyName: string;
  setSendTo: (targets: ZcashURITarget | ZcashURITarget[]) => void;
  addressBookMap: Map<string, string>;
  moveValueTransferDetail: (index: number, type: number) => void;
};

const VtModalInternal: React.FC<RouteComponentProps & VtModalInternalProps> = ({
  index,
  length,
  totalLength,
  vt,
  modalIsOpen,
  closeModal,
  currencyName,
  setSendTo,
  history,
  addressBookMap,
  moveValueTransferDetail,
}) => {
  const context = useContext(ContextApp);
  const { readOnly, addressBook, addresses } = context;
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
  let labelReplyTo: string = "";

  const getLabelAddressBook = (addr: string) => {
    // Find the addr in addresses
    const label: AddressBookEntry | undefined = addressBook.find((ab: AddressBookEntry) => ab.address === addr);
    const labelStr: string = label ? `[ ${label.label} ]` : "";

    return labelStr; 
  };

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
    labelReplyTo = getLabelAddressBook(replyTo);
    if (!labelReplyTo) {
      labelReplyTo = addresses.find((a: Address) => a.address === replyTo) ? "[ This Wallet's Address ]" : "";
    }
  }


  const openTxid = (txid: string) => {
    if (currencyName === "TAZ") {
      shell.openExternal(`https://testnet.zcashexplorer.app/transactions/${txid}`);
    } else {
      shell.openExternal(`https://mainnet.zcashexplorer.app/transactions/${txid}`);
    }
  };

  const doReply = (address: string) => {
    setSendTo(new ZcashURITarget(address, undefined, undefined));
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
      <div style={{ position: "absolute", alignItems: 'center', top: 15, left: 40 }} className={[cstyles.horizontalflex].join(" ")}>
        {index === 0 ? (
          <div style={{ marginRight: 25, cursor: 'pointer', opacity: 0.5 }}>
            <i className={["fas", "fa-arrow-up", "fa-2x"].join(" ")} />
          </div>
        ) : (
          <div style={{ marginRight: 25, cursor: 'pointer' }} onClick={() => moveValueTransferDetail(index, -1)}>
            <i className={["fas", "fa-arrow-up", "fa-2x"].join(" ")} />
          </div>
        )}
        <div>{(index + 1).toString()}</div>
        {index === length - 1 ? (
          <div style={{ marginLeft: 25, cursor: 'pointer', opacity: 0.5 }}>
            <i className={["fas", "fa-arrow-down", "fa-2x"].join(" ")} />
          </div>
        ) : (
          <div style={{ marginLeft: 25, cursor: 'pointer' }} onClick={() => moveValueTransferDetail(index, 1)}>
            <i className={["fas", "fa-arrow-down", "fa-2x"].join(" ")} />
          </div>
        )}
      </div>
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
              <div className={[cstyles.sublight].join(" ")}>Transaction Fee</div>
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

          <div className={cstyles.primarybutton} onClick={() => openTxid(txid)}>
            View TXID &nbsp;
            <i className={["fas", "fa-external-link-square-alt"].join(" ")} />
          </div>
        </div>

        <hr style={{ width: "100%" }} />

            <div key={`${txid}-${address}-${pool}`} className={cstyles.verticalflex}>
              {!!address && (
                <>
                  <div className={[cstyles.sublight].join(" ")}>Address</div>
                  {!!label && (
                    <div className={cstyles.highlight} style={{ marginBottom: 0 }}>{label}</div> 
                  )}
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

              {memos && memos.length > 0 && !!memos.join("") && (
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
                      {memos.join("\n") + "\n" + labelReplyTo}
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