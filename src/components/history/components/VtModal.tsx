import React, { useContext, useEffect, useRef, useState } from "react";
import Modal from "react-modal";
import dateformat from "dateformat";
import { useNavigate } from "react-router-dom";
import { BalanceBlockHighlight } from "../../balanceBlock";
import styles from "../History.module.css";
import cstyles from "../../common/Common.module.css";
import {
  AddressBookEntryClass,
  ServerChainNameEnum,
  TransparentAddressClass,
  UnifiedAddressClass,
  ValueTransferClass,
  ValueTransferKindEnum,
  ValueTransferStatusEnum,
} from "../../appstate";
import Utils from "../../../utils/utils";
import { ZcashURITarget } from "../../../utils/uris";
import { ContextApp } from "../../../context/ContextAppState";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import routes from "../../../constants/routes.json";

import { native } from "../../../electronBridge";
import { useCopy } from "../../common/useCopy";
import DetailNavigator from "./DetailNavigator";

// zingolib PR #2466 split a VT's single pool into two lists. A VT's identity
// within a txid now depends on both (used to re-find it after a sync refresh).
const poolsKey = (vt: ValueTransferClass): string =>
  `${(vt.poolsSentFrom ?? []).join(",")}|${(vt.poolsReceived ?? []).join(",")}`;

// "Orchard, Sapling → Ironwood": source pools → destination pools. Either side is
// omitted when empty (a pure receive has no sources; a pure external send no
// destinations here). Empty string => no "Pools" line is shown.
const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const buildPoolsText = (vt: ValueTransferClass): string => {
  const from: string = (vt.poolsSentFrom ?? []).map(capitalize).join(", ");
  const to: string = (vt.poolsReceived ?? []).map(capitalize).join(", ");
  if (from && to) return `${from} → ${to}`;
  return to || from;
};

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
  /** Steps the open detail in History, which owns the list and picks the view. */
  moveDetail: (delta: number) => void;
};

const VtModalInternal: React.FC<VtModalInternalProps> = ({
  index,
  length,
  totalLength,
  vt,
  modalIsOpen,
  closeModal,
  currencyName,
  addressBookMap,
  valueTransfersSliced,
  moveDetail,
}) => {
  const navigate = useNavigate();
  const context = useContext(ContextApp);
  const {
    addressBook,
    addressesUnified,
    addressesTransparent,
    valueTransfers,
    readOnly,
    setSendTo,
    openErrorModal,
    openConfirmModal,
    setAddLabel,
    currentWallet,
    blockExplorerMainnetTransaction,
    blockExplorerTestnetTransaction,
    blockExplorerMainnetTransactionCustom,
    blockExplorerTestnetTransactionCustom,
  } = context;
  const [valueTransfer, setValueTransfer] = useState<ValueTransferClass | undefined>(vt ? vt : undefined);
  // Straight from the prop: History remounts this per row, so the prop is
  // always the row on screen and a second copy could only fall behind it.
  const valueTransferIndex = index;
  const [expandAddress, setExpandAddress] = useState(false);
  const [expandTxid, setExpandTxid] = useState(false);
  const { copied: addressCopied, copy: copyAddress } = useCopy(1500);
  const { copied: txidCopied, copy: copyTxid } = useCopy(1500);
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
    return valueTransfers.filter(
      (vtt: ValueTransferClass) => vtt.txid === v.txid && vtt.address === v.address && poolsKey(vtt) === poolsKey(v),
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

  let txid: string = "";
  let typeText: string = "";
  let typeIcon: string = "";
  let typeColor: string = "";
  let confirmations: number = 0;
  let status: ValueTransferStatusEnum | "" = "";
  let address: string | undefined = undefined;
  let memos: string[] = [];
  let poolsText: string = "";
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
    const label: AddressBookEntryClass | undefined = addressBook.find(
      (ab: AddressBookEntryClass) => ab.address === addr,
    );
    const labelStr: string = label ? `[ ${label.label} ]` : "";

    return labelStr;
  };

  // A swap row's `txid` is the deposit transaction only once one exists; before
  // that it falls back to the deposit address, which is no txid at all. So the
  // two actions that treat the field as a real transaction identifier, the
  // block-explorer link and the remove call into zingolib, stay off these rows.
  // Nothing is lost: the on-chain leg of an outbound swap appears as its own
  // Sent row, which carries the genuine txid.
  const isSwapRow = valueTransfer?.type === ValueTransferKindEnum.swap;

  if (valueTransfer) {
    txid = valueTransfer.txid;
    typeText = Utils.VTTypeWithConfirmations(valueTransfer.type, valueTransfer.status, valueTransfer.confirmations);
    if (valueTransfer.type === ValueTransferKindEnum.received || ValueTransferKindEnum.shield) {
      typeIcon = "fa-arrow-circle-down";
      typeColor = Utils.getCssVariable("--color-primary");
    } else {
      typeIcon = "fa-arrow-circle-up";
      typeColor = Utils.getCssVariable("--color-text");
    }

    datePart = dateformat(valueTransfer.time * 1000, "mmm dd, yyyy");
    timePart = dateformat(valueTransfer.time * 1000, "hh:MM tt");

    confirmations = valueTransfer.confirmations;
    status = valueTransfer.status;
    amount = valueTransfer.amount;
    fees = valueTransfer.fee ? valueTransfer.fee : 0;
    address = valueTransfer.address;
    memos = valueTransfer.memos && valueTransfer.memos.length > 0 ? valueTransfer.memos : [];
    poolsText = buildPoolsText(valueTransfer);
    // The transaction detail's converted USD value (`price * amount`) uses the
    // price recorded at generation, never the current price; a tx with no
    // recorded price renders `USD --` rather than a wrong figure.
    price = valueTransfer.zec_price || 0;
    if (currencyName === "ZEC") {
      priceString = Utils.getZecToUsdString(price, amount);
    }
  }

  const { bigPart, smallPart }: { bigPart: string; smallPart: string } = Utils.splitZecAmountIntoBigSmall(amount);

  const label: string = (address ? addressBookMap.get(address) : undefined) || "";

  const memoTotal = memos ? memos.join("") : "";
  if (memoTotal.includes("\nReply to: \n")) {
    let memoArray = memoTotal.split("\nReply to: \n");
    const memoPoped = memoArray.pop();
    replyTo = memoPoped ? memoPoped.toString() : "";
    labelReplyTo = getLabelAddressBook(replyTo);
    if (!labelReplyTo) {
      const u: boolean = !!addressesUnified.find((a: UnifiedAddressClass) => a.encoded_address === replyTo);
      const t: boolean = !!addressesTransparent.find((a: TransparentAddressClass) => a.encoded_address === replyTo);
      labelReplyTo = u || t ? "[ This Wallet's Address ]" : "";
    }
  }

  const localCloseModal = () => {
    setExpandAddress(false);
    setExpandTxid(false);
    closeModal();
  };

  const runAction = async () => {
    localCloseModal();
    openConfirmModal("Remove Transaction", "Please confirm the Action", () => runActionConfirmed());
  };

  const runActionConfirmed = async () => {
    // modal while waiting.
    openErrorModal("Computing Transaction", "Please wait...This could take a while");

    try {
      const actionStr: string = await native.remove_transaction(txid);
      // Result is structured JSON: `{ status }` on success, `{ error }` on
      // failure — never error prose on the data channel.
      const actionJSON = JSON.parse(actionStr);
      if (actionJSON.error) {
        openErrorModal("Remove", "Remove " + actionJSON.error);
      } else {
        openErrorModal("Remove", actionJSON.status);
      }
    } catch (error: any) {
      console.error(`Critical Error Remove ${error}`);
      openErrorModal("Remove", error);
    }
  };

  const sendMore = () => {
    // first close the current modal
    localCloseModal();

    setSendTo(new ZcashURITarget(address, undefined, undefined));
    navigate(routes.SEND);
  };

  const addLabel = () => {
    // first close the current modal
    localCloseModal();

    setAddLabel(new AddressBookEntryClass("", address ?? ""));
    navigate(routes.ADDRESSBOOK);
  };

  return (
    <Modal
      isOpen={modalIsOpen}
      onRequestClose={localCloseModal}
      className={styles.txmodal}
      overlayClassName={styles.txmodalOverlay}
    >
      {showNavigator && <DetailNavigator index={valueTransferIndex} length={length} move={moveDetail} />}
      <div className={cstyles.verticalflex}>
        <div className={cstyles.center}>Transaction Status</div>

        <div
          className={`${cstyles.center} ${cstyles.horizontalflex}`}
          style={{ width: "100%", alignItems: "center", justifyContent: "center" }}
        >
          <div
            className={`${cstyles.center} ${cstyles.verticalflex}`}
            style={{ alignItems: "center", justifyContent: "center" }}
          >
            <i className={`${"fas"} ${typeIcon}`} style={{ fontSize: "35px", color: typeColor }} />
            {typeText}
          </div>

          <div className={cstyles.center} style={{ marginLeft: 20 }}>
            <BalanceBlockHighlight
              zecValue={amount}
              usdValue={priceString}
              currencyName={currencyName}
              status={status}
            />
          </div>
        </div>

        {confirmations === 0 /* not min confirmations applied */ && (
          <>
            {status === ValueTransferStatusEnum.failed && !isSwapRow && (
              <>
                <hr style={{ width: "100%" }} />

                <div
                  className={`${cstyles.center} ${cstyles.horizontalflex}`}
                  style={{ width: "100%", alignItems: "center", justifyContent: "center" }}
                >
                  <button type="button" className={cstyles.primarybutton} onClick={() => runAction()}>
                    Remove
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {confirmations >= 0 && confirmations < 3 && (
          <div
            className={`${cstyles.center} ${cstyles.horizontalflex}`}
            style={{ width: "100%", alignItems: "center", justifyContent: "center", marginTop: 10 }}
          >
            {(status === ValueTransferStatusEnum.transmitted || status === ValueTransferStatusEnum.calculated) && (
              <FontAwesomeIcon
                style={{ marginRight: 5 }}
                icon={faTriangleExclamation}
                color={Utils.getCssVariable("--color-warning")}
                size="xs"
              />
            )}
            {(status === ValueTransferStatusEnum.transmitted ||
              status === ValueTransferStatusEnum.calculated ||
              status === ValueTransferStatusEnum.mempool ||
              status === ValueTransferStatusEnum.failed) && (
              <div
                style={{
                  color:
                    status === ValueTransferStatusEnum.failed
                      ? Utils.getCssVariable("--color-error")
                      : status === ValueTransferStatusEnum.transmitted || status === ValueTransferStatusEnum.calculated
                        ? Utils.getCssVariable("--color-primary")
                        : Utils.getCssVariable("--color-primary-disable"),
                  fontSize: 12,
                  fontWeight: "700",
                  textAlign: "center",
                  textDecorationLine:
                    status === ValueTransferStatusEnum.transmitted || status === ValueTransferStatusEnum.calculated
                      ? "underline"
                      : "none",
                }}
              >
                {`${status} - Transaction not yet confirmed`}
              </div>
            )}
            {status === ValueTransferStatusEnum.confirmed && confirmations >= 0 && confirmations < 3 && (
              <div
                style={{
                  color: Utils.getCssVariable("--color-primary-disable"),
                  fontSize: 12,
                  opacity: 1,
                  fontWeight: "700",
                  textAlign: "left",
                  textDecorationLine: "none",
                }}
              >
                {`${status} - Funds waiting for the minimum confirmations (3)`}
              </div>
            )}
          </div>
        )}

        <hr style={{ width: "100%" }} />

        <div className={cstyles.flexspacebetween}>
          <div>
            <div className={cstyles.sublight}>Time</div>
            <div>
              {datePart} {timePart}
            </div>
          </div>

          {fees > 0 && (
            <div>
              <div className={cstyles.sublight}>Transaction Fee</div>
              <div>ZEC {Utils.maxPrecisionTrimmed(fees)}</div>
              {currencyName === "ZEC" && <div className={cstyles.sublight}>{Utils.getZecToUsdString(price, fees)}</div>}
            </div>
          )}

          <div>
            <div className={cstyles.sublight}>Confirmations</div>
            <div>{confirmations}</div>
          </div>

          {(status === ValueTransferStatusEnum.calculated ||
            status === ValueTransferStatusEnum.transmitted ||
            status === ValueTransferStatusEnum.mempool ||
            status === ValueTransferStatusEnum.failed) && (
            <div>
              <div className={cstyles.sublight}>Status</div>
              <div
                style={{
                  color:
                    status === ValueTransferStatusEnum.failed
                      ? Utils.getCssVariable("--color-error")
                      : status === ValueTransferStatusEnum.calculated || status === ValueTransferStatusEnum.transmitted
                        ? Utils.getCssVariable("--color-warning")
                        : Utils.getCssVariable("--color-primary-disable"),
                }}
              >
                {status === ValueTransferStatusEnum.calculated
                  ? "Calculated"
                  : status === ValueTransferStatusEnum.transmitted
                    ? "Transmitted"
                    : status === ValueTransferStatusEnum.mempool
                      ? "In Mempool"
                      : status === ValueTransferStatusEnum.failed
                        ? "Failed"
                        : ""}
              </div>
            </div>
          )}
        </div>

        <div className={cstyles.margintoplarge} />

        {!!txid && (
          <div className={cstyles.flexspacebetween}>
            <div>
              <div className={cstyles.sublight}>
                TXID
                {txidCopied && (
                  <span className={cstyles.highlight} style={{ marginLeft: 8 }}>
                    Copied!
                  </span>
                )}
              </div>
              <div
                style={{ cursor: "pointer" }}
                onClick={() => {
                  if (txid) {
                    copyTxid(txid);
                    setExpandTxid(true);
                  }
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", flexWrap: "wrap" }}>
                  {!expandTxid && !!txid && Utils.trimToSmall(txid, 10)}
                  {expandTxid && !!txid && (
                    <>
                      {txid.length < 80
                        ? txid
                        : Utils.splitStringIntoChunks(txid, 3).map((item) => <div key={item}>{item}</div>)}
                    </>
                  )}
                </div>
              </div>
            </div>

            {!isSwapRow && currentWallet?.chain_name !== ServerChainNameEnum.regtestChainName && (
              <div
                className={cstyles.primarybutton}
                onClick={() =>
                  Utils.openTxid(
                    txid,
                    currentWallet?.chain_name,
                    currentWallet?.chain_name === ServerChainNameEnum.mainChainName
                      ? blockExplorerMainnetTransaction
                      : blockExplorerTestnetTransaction,
                    currentWallet?.chain_name === ServerChainNameEnum.mainChainName
                      ? blockExplorerMainnetTransactionCustom
                      : blockExplorerTestnetTransactionCustom,
                  )
                }
              >
                View TXID &nbsp;
                <i className={`${"fas"} ${"fa-external-link-square-alt"}`} />
              </div>
            )}
          </div>
        )}

        <hr style={{ width: "100%" }} />

        {!!address && (
          <div className={cstyles.flexspacebetween}>
            <div>
              <div className={cstyles.sublight}>
                Address
                {addressCopied && (
                  <span className={cstyles.highlight} style={{ marginLeft: 8 }}>
                    Copied!
                  </span>
                )}
              </div>
              {!!label && (
                <div className={cstyles.highlight} style={{ marginBottom: 0 }}>
                  {label}
                </div>
              )}
              <div className={cstyles.verticalflex}>
                <div
                  style={{ cursor: "pointer" }}
                  onClick={() => {
                    if (address) {
                      copyAddress(address);
                      setExpandAddress(true);
                    }
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", flexWrap: "wrap" }}>
                    {!expandAddress && !!address && Utils.trimToSmall(address, 10)}
                    {expandAddress && !!address && (
                      <>
                        {address.length < 80
                          ? address
                          : Utils.splitStringIntoChunks(address, 3).map((item) => <div key={item}>{item}</div>)}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {!label && (
              <div>
                <button type="button" className={cstyles.primarybutton} onClick={() => addLabel()}>
                  Add Label
                </button>
              </div>
            )}

            {!readOnly && (
              <div>
                <button type="button" className={cstyles.primarybutton} onClick={() => sendMore()}>
                  Send More
                </button>
              </div>
            )}
          </div>
        )}

        <div className={cstyles.margintoplarge} />

        <div className={cstyles.flexspacebetween}>
          <div className={cstyles.verticalflex}>
            <div className={cstyles.sublight}>Amount</div>
            <div className={cstyles.verticalflex}>
              <div className={cstyles.verticalflex}>
                <div>
                  <span>
                    {currencyName} {bigPart}
                  </span>
                  <span className={`${cstyles.small} ${cstyles.zecsmallpart}`}>{smallPart}</span>
                </div>
              </div>
              <div className={cstyles.verticalflex}>
                <div className={cstyles.sublight}>{priceString}</div>
              </div>
            </div>
          </div>

          {poolsText && (
            <div className={cstyles.verticalflex}>
              <div className={cstyles.sublight}>Pools</div>
              <div className={cstyles.flexspacebetween}>
                <div>{poolsText}</div>
              </div>
            </div>
          )}
        </div>

        <div className={cstyles.margintoplarge} />

        {memos && memos.length > 0 && !!memos.join("") && (
          <div>
            <div className={cstyles.sublight}>Memo</div>
            <div className={cstyles.flexspacebetween}>
              <div
                className={[cstyles.small, cstyles.sublight, cstyles.padtopsmall, cstyles.memodiv, styles.txmemo].join(
                  " ",
                )}
              >
                {memos.join("\n") + "\n" + labelReplyTo}
              </div>
            </div>
          </div>
        )}

        <hr style={{ width: "100%" }} />

        <div className={`${cstyles.center} ${cstyles.margintoplarge}`}>
          <button type="button" className={cstyles.primarybutton} onClick={localCloseModal}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default VtModalInternal;
