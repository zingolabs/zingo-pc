import React, { useContext, useEffect, useRef, useState } from "react";
import Modal from "react-modal";
import dateformat from "dateformat";
import { RouteComponentProps, withRouter } from "react-router";
import { BalanceBlockHighlight } from "../../balanceBlock";
import styles from "../History.module.css";
import cstyles from "../../common/Common.module.css";
import { AddressBookEntryClass, TransparentAddressClass, UnifiedAddressClass, ValueTransferClass, ValueTransferKindEnum, ValueTransferPoolEnum, ValueTransferStatusEnum } from "../../appstate";
import Utils from "../../../utils/utils";
import { ZcashURITarget } from "../../../utils/uris";
import { ContextApp } from "../../../context/ContextAppState";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import routes from "../../../constants/routes.json";

import native from "../../../native.node";

const { clipboard } = window.require("electron");

type VtModalInternalProps = {
  index: number;
  length: number;
  totalLength: number;
  vt?: ValueTransferClass;
  modalIsOpen: boolean;
  closeModal: () => void;
  currencyName: string;
  addressBookMap: Map<string, string>;
  valueTransfersSliced: ValueTransferClass[];
};

const VtModalInternal: React.FC<RouteComponentProps & VtModalInternalProps> = ({
  index,
  length,
  totalLength,
  vt,
  modalIsOpen,
  closeModal,
  currencyName,
  history,
  addressBookMap,
  valueTransfersSliced,
}) => {
  const context = useContext(ContextApp);
  const { addressBook, addressesUnified, addressesTransparent, valueTransfers, readOnly, info, setSendTo, openErrorModal, openConfirmModal, setAddLabel } = context; 
  const [valueTransfer, setValueTransfer] = useState<ValueTransferClass | undefined>(vt ? vt : undefined);
  const [valueTransferIndex, setValueTransferIndex] = useState<number>(index);
  const [expandAddress, setExpandAddress] = useState(false); 
  const [expandTxid, setExpandTxid] = useState(false);
  const [showNavigator, setShowNavigator] = useState<boolean>(true);
  const isTheFirstMount = useRef(true);

  // if the App is syncing, the VT list will change (new items).
  // Hide the navigator is the solution because the current index
  // will be associated to other item. 
  useEffect(() => {
    if (isTheFirstMount.current) {
      isTheFirstMount.current = false;
      return;
    }
    if (showNavigator) {
      setShowNavigator(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalLength]);

  // modals make a copy of the parameter when use `show` -> unmutable props.
  // when this component render (probably motivate by the parent)
  // is the moment to get again the updated values to show in this component.
  const getValueTransferAgain = (v: ValueTransferClass) => {
    if (!valueTransfers) {
      return [] as ValueTransferClass[];
    }
    return valueTransfers.filter((vtt: ValueTransferClass) =>
      vtt.txid === v.txid && vtt.address === v.address && vtt.pool === v.pool
    );
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (valueTransfer) {
      const vtNew = getValueTransferAgain(valueTransfer);
      if (vtNew.length !== 1) {
        // something really weird is happening...
        localCloseModal();
      } else {
        setValueTransfer(vtNew[0]);
      }
    }
  });

    const moveValueTransferDetail = (indexParm: number, typeParm: number) => {
    // -1 -> Previous ValueTransfer
    //  1 -> Next ValueTransfer
    if ((indexParm > 0 && typeParm === -1) ||
        (indexParm < valueTransfersSliced.length - 1 && typeParm === 1)) {
      const newIndex = indexParm + typeParm;
      const vtNew = getValueTransferAgain(valueTransfersSliced[newIndex]);
      if (vtNew.length !== 1) {
        // something really weird is happening...
        localCloseModal();
      } else {
        setValueTransfer(vtNew[0]);
        setValueTransferIndex(newIndex);
      }
    }
  };

  const handleKeyDown = (event: any) => {
    if (event.key === 'ArrowUp') {
      // Mover a la transacción anterior
      moveValueTransferDetail(valueTransferIndex, -1);
    } else if (event.key === 'ArrowDown') {
      // Mover a la siguiente transacción
      moveValueTransferDetail(valueTransferIndex, 1);
    }
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueTransferIndex]);
  
  let txid: string = "";
  let type: ValueTransferKindEnum | "" = "";
  let typeText: string = "";
  let typeIcon: string = "";
  let typeColor: string = "";
  let confirmations: number = 0;
  let blockHeight: number = 0;
  let status: ValueTransferStatusEnum | "" = "";
  let address: string = "";
  let memos: string[] = [];
  let pool: ValueTransferPoolEnum | "" = "";
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
    const label: AddressBookEntryClass | undefined = addressBook.find((ab: AddressBookEntryClass) => ab.address === addr);
    const labelStr: string = label ? `[ ${label.label} ]` : "";

    return labelStr; 
  };

  if (valueTransfer) {
    txid = valueTransfer.txid;
    type = valueTransfer.type;
    typeText = Utils.VTTypeWithConfirmations(valueTransfer.type, valueTransfer.confirmations);
    if (valueTransfer.type === ValueTransferKindEnum.received || ValueTransferKindEnum.shield) {
      typeIcon = "fa-arrow-circle-down";
      typeColor = Utils.getCssVariable('--color-primary');
    } else {
      typeIcon = "fa-arrow-circle-up";
      typeColor = Utils.getCssVariable('--color-text');
    }

    datePart = dateformat(valueTransfer.time * 1000, "mmm dd, yyyy");
    timePart = dateformat(valueTransfer.time * 1000, "hh:MM tt");

    confirmations = valueTransfer.confirmations;
    blockHeight = valueTransfer.blockheight;
    status = valueTransfer.status;
    amount = valueTransfer.amount;
    fees = valueTransfer.fee ? valueTransfer.fee : 0;
    address = valueTransfer.address;
    memos = valueTransfer.memos && valueTransfer.memos.length > 0 ? valueTransfer.memos : [];
    pool = valueTransfer.pool ? valueTransfer.pool : '';
    price = valueTransfer.zec_price ? valueTransfer.zec_price : 0;
    if (price && currencyName === 'ZEC') {
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
      const u: boolean = !!addressesUnified.find((a: UnifiedAddressClass) => a.encoded_address === replyTo)
      const t: boolean = !!addressesTransparent.find((a: TransparentAddressClass) => a.encoded_address === replyTo)
      labelReplyTo = u || t ? "[ This Wallet's Address ]" : "";
    }
  }

  const localCloseModal = () => {
    setExpandAddress(false);
    setExpandTxid(false);
    closeModal();
  };

  const runAction = async (action: 'resend' | 'remove') => {
    localCloseModal(); 
    openConfirmModal(action === 'remove' ? 'Remove Transaction' : 'Resend Transaction', "Please confirm the Action", () => runActionConfirmed(action));
  };

  const runActionConfirmed = async (action: 'resend' | 'remove') => {
    // modal while waiting.
    openErrorModal("Computing Transaction", "Please wait...This could take a while");

    try {
      let actionStr: string;
      if (action === 'resend') {
        actionStr = await native.resend_transaction(txid);
      } else {
        actionStr = await native.remove_transaction(txid);
      }

      //console.log(actionStr);

      if (actionStr) {
        if (actionStr.toLowerCase().startsWith('error')) {
          if (action === 'resend') {
            openErrorModal("Resend", "Resend " + actionStr);
          } else {
            openErrorModal("Remove", "Remove " + actionStr);
          }
        } else {
          if (action === 'resend') {
            openErrorModal("Resend", actionStr);
          } else {
            openErrorModal("Remove", actionStr);
          }
        }
      }
    } catch (error: any) {
      if (action === 'resend') {
        console.log(`Critical Error Resend ${error}`);
        openErrorModal("Resend", error);
      } else {
        console.log(`Critical Error Remove ${error}`);
        openErrorModal("Remove", error);
      }
    }
  };

  const sendMore = () => {
    // first close the current modal
    localCloseModal();

    setSendTo(new ZcashURITarget(address, undefined, undefined));
    history.push(routes.SEND);
  };

  const addLabel = () => {
    // first close the current modal
    localCloseModal();

    setAddLabel(new AddressBookEntryClass('', address));
    history.push(routes.ADDRESSBOOK);
  };

  //console.log('render details', isTheFirstMount, showNavigator, totalLength);

  return (
    <Modal
      isOpen={modalIsOpen}
      onRequestClose={localCloseModal}
      className={styles.txmodal}
      overlayClassName={styles.txmodalOverlay}
    >
      {showNavigator && (
        <div style={{ position: "absolute", alignItems: 'center', top: 15, left: 40 }} className={[cstyles.horizontalflex].join(" ")}>
          {valueTransferIndex === 0 ? (
            <div style={{ marginRight: 25, cursor: 'pointer', opacity: 0.5 }}>
              <i className={["fas", "fa-arrow-up", "fa-2x"].join(" ")} />
            </div>
          ) : (
            <div style={{ marginRight: 25, cursor: 'pointer' }} onClick={() => moveValueTransferDetail(valueTransferIndex, -1)}>
              <i className={["fas", "fa-arrow-up", "fa-2x"].join(" ")} />
            </div>
          )}
          <div>{(valueTransferIndex + 1).toString()}</div>
          {valueTransferIndex === length - 1 ? (
            <div style={{ marginLeft: 25, cursor: 'pointer', opacity: 0.5 }}>
              <i className={["fas", "fa-arrow-down", "fa-2x"].join(" ")} />
            </div>
          ) : (
            <div style={{ marginLeft: 25, cursor: 'pointer' }} onClick={() => moveValueTransferDetail(valueTransferIndex, 1)}>
              <i className={["fas", "fa-arrow-down", "fa-2x"].join(" ")} />
            </div>
          )}
        </div>
      )}
      <div className={[cstyles.verticalflex].join(" ")}>
        <div className={[cstyles.center].join(" ")}>Transaction Status</div>

        <div className={[cstyles.center, cstyles.horizontalflex].join(" ")} 
             style={{ width: "100%", alignItems: "center", justifyContent: "center" }}>
          <div className={[cstyles.center, cstyles.verticalflex].join(" ")}
               style={{ alignItems: "center", justifyContent: "center" }}>
            <i className={["fas", typeIcon].join(" ")} style={{ fontSize: "35px", color: typeColor }} />
            {typeText}
          </div>

          <div className={[cstyles.center].join(" ")} style={{ marginLeft: 20 }}>
            <BalanceBlockHighlight
              zecValue={amount}
              usdValue={priceString} 
              currencyName={currencyName}
            />
          </div>
        </div>

        {confirmations === 0 && ( /* not min confirmations applied */
          <>
            <hr style={{ width: "100%" }} />

            {(status === ValueTransferStatusEnum.calculated ||
              status === ValueTransferStatusEnum.transmitted ||
              status === ValueTransferStatusEnum.mempool) && (
              <>
                <div className={[cstyles.center, cstyles.horizontalflex].join(" ")} 
                     style={{ width: "100%", alignItems: "center", justifyContent: "center" }}>
                  {(status === ValueTransferStatusEnum.calculated ||
                    status === ValueTransferStatusEnum.transmitted) &&
                    info.latestBlock - blockHeight < 40 &&
                    !readOnly && (
                    <button type="button" className={cstyles.primarybutton} onClick={() => runAction('resend')}>
                      Resend
                    </button>
                  )}
                  {type !== ValueTransferKindEnum.received && (
                    <button type="button" className={cstyles.primarybutton} onClick={() => runAction('remove')}>
                      Remove
                    </button>
                  )}
                </div>
                {type !== ValueTransferKindEnum.received && (
                  <div className={[cstyles.center, cstyles.horizontalflex].join(" ")} 
                       style={{ width: "100%", alignItems: "center", justifyContent: "center", fontSize: 12, marginTop: 10 }}>
                    Remove transaction to restore balance
                  </div>
                )}
              </>
            )}
          </>
        )}

        {confirmations >= 0 &&
          confirmations < 3 && (
          <div className={[cstyles.center, cstyles.horizontalflex].join(" ")} 
               style={{ width: "100%", alignItems: "center", justifyContent: "center", marginTop: 10 }}>
            {(status === ValueTransferStatusEnum.transmitted ||
              status === ValueTransferStatusEnum.calculated) && (
              <FontAwesomeIcon
                style={{ marginRight: 5 }}
                icon={faTriangleExclamation}
                color={Utils.getCssVariable('--color-warning')}
                size='xs'
              />
            )}
            {(status === ValueTransferStatusEnum.transmitted ||
              status === ValueTransferStatusEnum.calculated ||
              status === ValueTransferStatusEnum.mempool) && (
              <div
                style={{
                  color:
                    status === ValueTransferStatusEnum.transmitted ||
                    status === ValueTransferStatusEnum.calculated
                      ? Utils.getCssVariable('--color-primary')
                      : Utils.getCssVariable('--color-primary-disable'),
                  fontSize: 12,
                  fontWeight: '700',
                  textAlign:'center',
                  textDecorationLine:
                    status === ValueTransferStatusEnum.transmitted ||
                    status === ValueTransferStatusEnum.calculated
                      ? 'underline'
                      : 'none',
                }}>
                {`${status} - Transaction not yet confirmed`}
              </div>
            )}
            {status === ValueTransferStatusEnum.confirmed &&
              confirmations >= 0 &&
              confirmations < 3 && (
              <div
                style={{
                  color: Utils.getCssVariable('--color-primary-disable'),
                  fontSize: 12,
                  opacity: 1,
                  fontWeight: '700',
                  textAlign: 'left',
                  textDecorationLine: 'none',
                }}>
                {`${status} - Funds waiting for the minimum confirmations (3)`}
              </div>
            )}
          </div>
        )}

        <hr style={{ width: "100%" }} />

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
            <div>{confirmations}</div>
          </div>

          {(status === ValueTransferStatusEnum.calculated || status === ValueTransferStatusEnum.transmitted || status === ValueTransferStatusEnum.mempool) && (
            <div>
              <div className={[cstyles.sublight].join(" ")}>Status</div>
              <div style={{ color: status === ValueTransferStatusEnum.calculated || status === ValueTransferStatusEnum.transmitted ? Utils.getCssVariable('--color-warning') : Utils.getCssVariable('--color-primary-disable') }}>
                {status === ValueTransferStatusEnum.calculated ? 'Calculated' : status === ValueTransferStatusEnum.transmitted ? 'Transmitted' : status === ValueTransferStatusEnum.mempool ? 'In Mempool': ''}
              </div>
            </div>
          )}
        </div>

        <div className={cstyles.margintoplarge} />

        {!!txid && ( 
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
                  {!expandTxid && !!txid && Utils.trimToSmall(txid, 10)}
                  {expandTxid && !!txid && (
                    <>
                      {txid.length < 80 ? txid : Utils.splitStringIntoChunks(txid, 3).map(item => <div key={item}>{item}</div>)}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className={cstyles.primarybutton} onClick={() => Utils.openTxid(txid, currencyName)}>
              View TXID &nbsp;
              <i className={["fas", "fa-external-link-square-alt"].join(" ")} />
            </div>
          </div>
        )}

        <hr style={{ width: "100%" }} />
   
        {!!address && (
          <div className={[cstyles.flexspacebetween].join(" ")}>
            <div>
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
            </div>

            {!label && (
              <div>
                <div className={cstyles.primarybutton} onClick={() => addLabel()}>
                  Add Label
                </div>
              </div>
            )}

            {!readOnly && (
              <div>
                <div className={cstyles.primarybutton} onClick={() => sendMore()}>
                  Send More
                </div>
              </div>
            )}
          </div>
        )}

        <div className={cstyles.margintoplarge} />

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
            </div>
          </div>
        )}

        <hr style={{ width: "100%" }} />

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