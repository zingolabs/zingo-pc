import React, { useCallback, useContext, useEffect, useState } from "react";
import Modal from "react-modal";
import { useNavigate } from "react-router-dom";
import styles from "../Send.module.css";
import cstyles from "../../common/Common.module.css";
import {
  SendPageStateClass,
  InfoClass,
  TotalBalanceClass,
  AddressKindEnum,
  AddressBookEntryClass,
  ToAddrClass,
  ServerChainNameEnum,
} from "../../appstate";
import Utils from "../../../utils/utils";
import { usePaneOffset } from "../../scrollPane/usePaneOffset";
import { useCopy } from "../../common/useCopy";
import { Field, FieldRow } from "../../common/DetailField";
import { BalanceBlockHighlight } from "../../balanceBlock";
import routes from "../../../constants/routes.json";
import getSendManyJSON from "./getSendManyJSON";
import SendManyJsonType from "./SendManyJSONType";

import { native } from "../../../electronBridge";
import { ContextApp } from "../../../context/ContextAppState";
import { faArrowCircleUp, faExternalLinkSquareAlt } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

const PRIVACY_RANK: { [level: string]: number } = { Private: 0, "Amount Revealed": 1, Deshielded: 2 };

/**
 * The privacy of the transaction as a whole: the weakest of its outputs. One
 * deshielded recipient makes the transaction deshielded, whatever the others
 * receive, and a verdict that could not be reached ("-") outranks them all.
 */
export const worstPrivacyLevel = (levels: string[]): string => {
  if (levels.length === 0) {
    return "-";
  }
  return levels.reduce((worst: string, level: string) =>
    (PRIVACY_RANK[level] ?? 3) > (PRIVACY_RANK[worst] ?? 3) ? level : worst,
  );
};

type FeeValueProps = {
  sendFee: number;
  currencyName: string;
  zecPrice: number;
};

const FeeValue: React.FC<FeeValueProps> = ({ sendFee, currencyName, zecPrice }) => (
  <>
    {currencyName} {Utils.maxPrecisionTrimmed(sendFee)}
    {currencyName === "ZEC" && <div className={cstyles.sublight}>{Utils.getZecToUsdString(zecPrice, sendFee)}</div>}
  </>
);

type RecipientSummaryProps = {
  toaddr: ToAddrClass;
  privacyLevel: string;
  currencyName: string;
  zecPrice: number;
  // Stated beside the amount when this is the only recipient, where the
  // screen always put it. A batch states it once, under all of them.
  sendFee?: number;
};

const RecipientSummary: React.FC<RecipientSummaryProps> = ({
  toaddr,
  privacyLevel,
  currencyName,
  zecPrice,
  sendFee,
}) => {
  const { addressBook } = useContext(ContextApp);

  // The recipient, and the two things this screen does with it: reveal the
  // whole of it, and put it on the clipboard. One press does both, which is
  // the gesture the transfer detail and the address book already use.
  const [expandAddress, setExpandAddress] = useState<boolean>(false);
  const { copied: addressCopied, copy: copyAddress } = useCopy(1500);

  const toAddress: string = toaddr.znsAlias || toaddr.to;
  const { bigPart: amountBigPart, smallPart: amountSmallPart } = Utils.splitZecAmountIntoBigSmall(toaddr.amount);
  // The name this address is filed under, if any — the same thing the detail
  // shows above the address itself.
  const contactLabel: string | undefined = addressBook?.find(
    (entry: AddressBookEntryClass) => entry.address === toAddress,
  )?.label;
  const memoText: string = `${toaddr.memo ?? ""}${toaddr.memoReplyTo ?? ""}`;

  return (
    <>
      {/* Two rows rather than a block and two: the address beside what
          sending to it costs in privacy, and then the figures. The address
          block itself is the transfer detail's — the "Copied!" flash rides on
          the label, the contact name it is filed under sits between label and
          value, and the value abbreviates until the press that copies it also
          opens it. */}
      <FieldRow>
        {!!toAddress && (
          <div className={cstyles.padtopsmall} style={{ minWidth: 0 }}>
            <div className={cstyles.sublight}>
              Address
              {addressCopied && (
                <span className={cstyles.highlight} style={{ marginLeft: 8 }}>
                  Copied!
                </span>
              )}
            </div>
            {!!contactLabel && (
              <div className={cstyles.highlight} style={{ marginBottom: 0 }}>
                {contactLabel}
              </div>
            )}
            <div className={cstyles.verticalflex}>
              <button
                type="button"
                aria-label="Copy address"
                title="Copy address"
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: "inherit",
                  font: "inherit",
                  textAlign: "left",
                  cursor: "pointer",
                }}
                onClick={() => {
                  copyAddress(toAddress);
                  setExpandAddress(true);
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", flexWrap: "wrap" }}>
                  {!expandAddress && Utils.trimToSmall(toAddress, 10)}
                  {expandAddress && (
                    <>
                      {toAddress.length < 80
                        ? toAddress
                        : Utils.splitStringIntoChunks(toAddress, 3).map((item) => <div key={item}>{item}</div>)}
                    </>
                  )}
                </div>
              </button>
            </div>
          </div>
        )}

        <Field label="Privacy" value={privacyLevel} />
      </FieldRow>

      {/* Each figure carries its fiat value underneath, the way the detail
          states them. The price is the one in context — this send has not
          happened, so the rate that matters is the one now rather than a basis
          captured alongside a past transfer. */}
      <FieldRow>
        <Field
          label="Amount"
          value={
            <>
              <div>
                <span>
                  {currencyName} {amountBigPart}
                </span>
                <span className={`${cstyles.small} ${styles.zecsmallpart}`}>{amountSmallPart}</span>
              </div>
              {currencyName === "ZEC" && (
                <div className={cstyles.sublight}>{Utils.getZecToUsdString(zecPrice, toaddr.amount)}</div>
              )}
            </>
          }
        />

        {sendFee !== undefined && (
          <Field
            label="Transaction Fee"
            value={<FeeValue sendFee={sendFee} currencyName={currencyName} zecPrice={zecPrice} />}
          />
        )}
      </FieldRow>

      {!!memoText && (
        <div className={cstyles.padtopsmall}>
          <div className={cstyles.sublight}>Memo</div>
          {/* Five rows, then it scrolls. A long memo used to grow the
              modal until the buttons left the screen. */}
          <div className={cstyles.fieldrowmulti} style={{ maxHeight: "7.5em", overflowY: "auto" }}>
            <div className={`${cstyles.fieldtextarea} ${cstyles.breakword}`} style={{ whiteSpace: "pre-wrap" }}>
              {memoText}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// Internal because we're using withRouter just below
type SendConfirmModalProps = {
  sendPageState: SendPageStateClass;
  totalBalance: TotalBalanceClass;
  info: InfoClass;
  sendTransaction: (sendJson: SendManyJsonType[]) => Promise<string>;
  clearToAddrs: () => void;
  closeModal: () => void;
  modalIsOpen: boolean;
  sendFee: number;
  currencyName: string;
};

const SendConfirmModal: React.FC<SendConfirmModalProps> = ({
  sendPageState,
  totalBalance,
  info,
  sendTransaction,
  clearToAddrs,
  closeModal,
  modalIsOpen,
  sendFee,
}) => {
  // The Cancel and Send row sits under the pane, and the block above it grows
  // with the number of recipients — so neither end of the pane is a constant.
  const { paneRef, footerRef, paneOffset } = usePaneOffset(350);

  const navigate = useNavigate();
  const context = useContext(ContextApp);
  const {
    currentWallet,
    openErrorModal,
    blockExplorerMainnetTransaction,
    blockExplorerTestnetTransaction,
    blockExplorerMainnetTransactionCustom,
    blockExplorerTestnetTransactionCustom,
    zecPrice,
  } = context;

  const recipients: ToAddrClass[] = sendPageState.toaddrs;
  const single: boolean = recipients.length === 1;

  const [sendingTotal, setSendingTotal] = useState<number>(0);
  const [privacyLevels, setPrivacyLevels] = useState<string[]>([]);

  const currentChainName = currentWallet?.chain_name ?? ServerChainNameEnum.mainChainName;

  // `totalOut` is what the whole transaction spends, every recipient plus the
  // fee. The pool it is drawn from is decided by that total, not by this one
  // recipient's amount: two small payments that each fit in Orchard can still
  // need Sapling together, and that changes what each of them reveals.
  const getPrivacyLevel = useCallback(
    async (toaddr: ToAddrClass, totalOut: number) => {
      if (!toaddr.to) {
        return "-";
      }

      let from: "orchard" | "orchard+sapling" | "sapling" | "" = "";
      // Orchard and Ironwood are one shielded pool (Ironwood is Orchard at
      // NU6.3); after migration the funds sit in Ironwood, so both count as the
      // orchard-equivalent private source and the privacy verdicts below stay
      // the same.
      const confirmedShielded = totalBalance.confirmedOrchardBalance + totalBalance.confirmedIronwoodBalance;
      if (totalOut <= confirmedShielded) {
        from = "orchard";
      } else if (confirmedShielded > 0 && totalOut <= confirmedShielded + totalBalance.confirmedSaplingBalance) {
        from = "orchard+sapling";
      } else if (totalOut <= totalBalance.confirmedSaplingBalance) {
        from = "sapling";
      }

      if (from === "") {
        return "-";
      }

      let resultJSON;
      try {
        const result: string = await native.parse_address(toaddr.to);
        if (!result) {
          return "-";
        }

        try {
          resultJSON = JSON.parse(result);
        } catch (error) {
          console.error("parse-address", error);
          return "-";
        }
      } catch (error) {
        console.error(`Critical Error parse address ${error}`);
        return "-";
      }

      const currChain = currentChainName;

      if (
        !(
          resultJSON &&
          resultJSON.status &&
          resultJSON.status === "success" &&
          resultJSON.chain_name &&
          resultJSON.chain_name === currChain
        )
      ) {
        return "-";
      }

      if (resultJSON.status !== "success") {
        return "-";
      }

      // Private -> orchard to orchard (UA with orchard receiver)
      if (
        from === "orchard" &&
        resultJSON.address_kind === AddressKindEnum.unified &&
        resultJSON.receivers_available?.includes("orchard")
      ) {
        return "Private";
      }

      // Private -> sapling to sapling (ZA or UA with sapling receiver and NO orchard receiver)
      if (
        from === "sapling" &&
        (resultJSON.address_kind === AddressKindEnum.sapling ||
          (resultJSON.address_kind === AddressKindEnum.unified &&
            resultJSON.receivers_available?.includes("sapling") &&
            !resultJSON.receivers_available?.includes("orchard")))
      ) {
        return "Private";
      }

      // Amount Revealed -> orchard to sapling (ZA or UA with sapling receiver)
      if (
        from === "orchard" &&
        (resultJSON.address_kind === AddressKindEnum.sapling ||
          (resultJSON.address_kind === AddressKindEnum.unified && resultJSON.receivers_available?.includes("sapling")))
      ) {
        return "Amount Revealed";
      }

      // Amount Revealed -> sapling to orchard (UA with orchard receiver)
      if (
        from === "sapling" &&
        resultJSON.address_kind === AddressKindEnum.unified &&
        resultJSON.receivers_available?.includes("orchard")
      ) {
        return "Amount Revealed";
      }

      // Amount Revealed -> sapling+orchard to orchard or sapling (UA with orchard receiver or ZA or
      // UA with sapling receiver)
      if (
        from === "orchard+sapling" &&
        (resultJSON.address_kind === AddressKindEnum.sapling ||
          (resultJSON.address_kind === AddressKindEnum.unified &&
            (resultJSON.receivers_available?.includes("orchard") ||
              resultJSON.receivers_available?.includes("sapling"))))
      ) {
        return "Amount Revealed";
      }

      // Deshielded -> orchard or sapling or orchard+sapling to transparent
      if (
        (from === "orchard" || from === "sapling" || from === "orchard+sapling") &&
        (resultJSON.address_kind === AddressKindEnum.transparent || resultJSON.address_kind === AddressKindEnum.tex)
      ) {
        return "Deshielded";
      }

      // whatever else
      return "-";
    },
    [
      totalBalance.confirmedOrchardBalance,
      totalBalance.confirmedIronwoodBalance,
      totalBalance.confirmedSaplingBalance,
      currentChainName,
    ],
  );

  useEffect(() => {
    // Summed in zatoshis so a batch of decimal amounts adds up exactly.
    const amountZats: number = recipients.reduce(
      (sum: number, toaddr: ToAddrClass) => sum + Math.round(Number(toaddr.amount) * 10 ** 8),
      0,
    );
    const totalOut: number = amountZats / 10 ** 8 + sendFee;
    setSendingTotal(totalOut);
    let cancelled: boolean = false;
    (async () => {
      const levels: string[] = await Promise.all(
        recipients.map((toaddr: ToAddrClass) => getPrivacyLevel(toaddr, totalOut)),
      );
      if (!cancelled) {
        setPrivacyLevels(levels);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getPrivacyLevel, sendFee, recipients]);

  const sendButton = async () => {
    const allSettings = await window.electronAPI.ipcRenderer.invoke("loadSettings");
    if (allSettings?.requireDeviceAuth) {
      const result: { success: boolean } = await window.electronAPI.ipcRenderer.invoke(
        "auth:verify",
        "Authorize transaction",
      );
      if (!result.success) return;
    }

    // First, close the confirm modal.
    closeModal();

    // This will be replaced by either a success TXID or error message that the user
    // has to close manually.
    openErrorModal("Computing Transaction", "Please wait...This could take a while");

    // Now, send the Tx in a timeout, so that the error modal above has a chance to display
    setTimeout(async () => {
      // Then send the Tx async
      try {
        const sendJson: SendManyJsonType[] = getSendManyJSON(sendPageState);
        const txidsResult: string = await sendTransaction(sendJson);

        if (!txidsResult) {
          openErrorModal("Error Sending Transaction", `${txidsResult}`);
        } else {
          const txids: string[] = txidsResult.split(", ");
          openErrorModal(
            "Successfully Broadcast Transaction",
            <div style={{ display: "flex", flexDirection: "row", justifyContent: "center", alignItems: "center" }}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  alignItems: "center",
                  marginRight: 10,
                }}
              >
                <div>{(txids.length === 1 ? "Transaction was" : "Transactions were") + " successfully broadcast."}</div>
                <div>{`TXID: ${txids[0]}`}</div>
                {txids.length > 1 && <div>{`TXID: ${txids[1]}`}</div>}
                {txids.length > 2 && <div>{`TXID: ${txids[2]}`}</div>}
              </div>
              {currentWallet?.chain_name !== ServerChainNameEnum.regtestChainName && (
                <div
                  style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}
                >
                  <button
                    type="button"
                    className={cstyles.primarybutton}
                    onClick={() =>
                      Utils.openTxid(
                        txids[0],
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
                    <FontAwesomeIcon icon={faExternalLinkSquareAlt} />
                  </button>
                  {txids.length > 1 && (
                    <button
                      type="button"
                      style={{ marginTop: 5 }}
                      className={cstyles.primarybutton}
                      onClick={() =>
                        Utils.openTxid(
                          txids[1],
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
                      <FontAwesomeIcon icon={faExternalLinkSquareAlt} />
                    </button>
                  )}
                  {txids.length > 2 && (
                    <button
                      type="button"
                      style={{ marginTop: 5 }}
                      className={cstyles.primarybutton}
                      onClick={() =>
                        Utils.openTxid(
                          txids[2],
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
                      <FontAwesomeIcon icon={faExternalLinkSquareAlt} />
                    </button>
                  )}
                </div>
              )}
            </div>,
          );
        }

        clearToAddrs();

        // Redirect to dashboard after
        navigate(routes.DASHBOARD);
      } catch (err) {
        // If there was an error, show the error modal
        openErrorModal("Error Sending Transaction", err instanceof Error ? err.message : `${err}`);
      }
    }, 10);
  };

  return (
    <Modal
      isOpen={modalIsOpen}
      onRequestClose={closeModal}
      className={styles.confirmModal}
      overlayClassName={cstyles.modalOverlay}
    >
      <div className={cstyles.verticalflex}>
        {/* The same header the transfer detail uses, because this is the same
            transaction one screen earlier: the direction as an icon, what is
            happening under it, and the total beside them. */}
        <div className={cstyles.center}>Confirm Transaction</div>

        <div
          className={`${cstyles.center} ${cstyles.horizontalflex}`}
          style={{ width: "100%", alignItems: "center", justifyContent: "center" }}
        >
          <div
            className={`${cstyles.center} ${cstyles.verticalflex}`}
            style={{ alignItems: "center", justifyContent: "center" }}
          >
            <FontAwesomeIcon icon={faArrowCircleUp} style={{ fontSize: "35px", color: "var(--color-text)" }} />
            Sending
          </div>

          <div className={cstyles.center} style={{ marginLeft: 20 }}>
            <BalanceBlockHighlight
              zecValue={sendingTotal}
              usdValue={info.currencyName === "ZEC" ? Utils.getZecToUsdString(zecPrice, sendingTotal) : ""}
              currencyName={info.currencyName}
            />
          </div>
        </div>

        <div
          className={cstyles.verticalflex}
          ref={paneRef}
          style={{ marginTop: 8, maxHeight: `calc(100vh - ${paneOffset}px)`, overflowY: "auto", overflowX: "hidden" }}
        >
          {recipients.map((toaddr: ToAddrClass, index: number) => (
            <div key={toaddr.id}>
              <hr style={{ width: "100%" }} />
              {!single && (
                <div className={`${cstyles.sublight} ${cstyles.small}`}>
                  Recipient {index + 1} of {recipients.length}
                </div>
              )}
              <RecipientSummary
                toaddr={toaddr}
                privacyLevel={privacyLevels[index] ?? ""}
                currencyName={info.currencyName}
                zecPrice={zecPrice}
                sendFee={single ? sendFee : undefined}
              />
            </div>
          ))}

          {/* A batch pays one fee and has one privacy: its weakest output's. */}
          {!single && (
            <>
              <hr style={{ width: "100%" }} />
              <FieldRow>
                <Field
                  label="Transaction Fee"
                  value={<FeeValue sendFee={sendFee} currencyName={info.currencyName} zecPrice={zecPrice} />}
                />
                <Field label="Privacy" value={worstPrivacyLevel(privacyLevels)} />
              </FieldRow>
            </>
          )}
        </div>

        <div className={cstyles.buttoncontainer} ref={footerRef}>
          <button type="button" className={cstyles.primarybutton} onClick={closeModal}>
            Cancel
          </button>
          <button type="button" className={cstyles.primarybutton} onClick={() => sendButton()}>
            Send
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default SendConfirmModal;
