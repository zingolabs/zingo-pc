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
import ScrollPaneTop from "../../scrollPane/ScrollPane";
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
    addressBook,
  } = context;

  const [sendingTotal, setSendingTotal] = useState<number>(0);
  const [privacyLevel, setPrivacyLevel] = useState<string>("");

  // The recipient, and the two things this screen does with it: reveal the
  // whole of it, and put it on the clipboard. One press does both, which is
  // the gesture the transfer detail and the address book already use.
  const [expandAddress, setExpandAddress] = useState<boolean>(false);
  const { copied: addressCopied, copy: copyAddress } = useCopy(1500);

  const toAddress: string = sendPageState.toaddr.znsAlias || sendPageState.toaddr.to;
  const toAmount: number = sendPageState.toaddr.amount;
  const { bigPart: amountBigPart, smallPart: amountSmallPart } = Utils.splitZecAmountIntoBigSmall(toAmount);
  // The name this address is filed under, if any — the same thing the detail
  // shows above the address itself.
  const contactLabel: string | undefined = addressBook?.find(
    (entry: AddressBookEntryClass) => entry.address === toAddress,
  )?.label;
  const memoText: string = `${sendPageState.toaddr.memo ?? ""}${sendPageState.toaddr.memoReplyTo ?? ""}`;

  const currentChainName = currentWallet?.chain_name ?? ServerChainNameEnum.mainChainName;

  const getPrivacyLevel = useCallback(
    async (toaddr: ToAddrClass) => {
      if (!toaddr.to) {
        return "-";
      }

      let from: "orchard" | "orchard+sapling" | "sapling" | "" = "";
      // Orchard and Ironwood are one shielded pool (Ironwood is Orchard at
      // NU6.3); after migration the funds sit in Ironwood, so both count as the
      // orchard-equivalent private source and the privacy verdicts below stay
      // the same.
      const confirmedShielded = totalBalance.confirmedOrchardBalance + totalBalance.confirmedIronwoodBalance;
      // amount + fee
      if (Number(toaddr.amount) + sendFee <= confirmedShielded) {
        from = "orchard";
      } else if (
        confirmedShielded > 0 &&
        Number(toaddr.amount) + sendFee <= confirmedShielded + totalBalance.confirmedSaplingBalance
      ) {
        from = "orchard+sapling";
      } else if (Number(toaddr.amount) + sendFee <= totalBalance.confirmedSaplingBalance) {
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
      sendFee,
      totalBalance.confirmedOrchardBalance,
      totalBalance.confirmedIronwoodBalance,
      totalBalance.confirmedSaplingBalance,
      currentChainName,
    ],
  );

  useEffect(() => {
    const sendingTotal: number = sendPageState.toaddr.amount + sendFee;
    setSendingTotal(sendingTotal);
    (async () => {
      const privacyLevel: string = await getPrivacyLevel(sendPageState.toaddr);
      setPrivacyLevel(privacyLevel);
    })();
  }, [getPrivacyLevel, sendFee, sendPageState.toaddr]);

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

        <div className={`${cstyles.verticalflex} ${cstyles.margintoplarge}`} ref={paneRef}>
          <ScrollPaneTop offsetHeight={paneOffset}>
            <hr style={{ width: "100%" }} />

            {/* The address block the transfer detail draws: the label carries
                the "Copied!" flash, the contact name sits under it when the
                address has one, and the value abbreviates until the press
                that copies it also opens it. */}
            {!!toAddress && (
              <div className={cstyles.padtopsmall}>
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

            {/* Amount and fee each carry their fiat value underneath, the way
                the detail states them. The price is the one in context — this
                send happens now, so the rate that matters is the current one
                rather than a basis captured alongside a past transfer. */}
            <FieldRow>
              <Field
                label="Amount"
                value={
                  <>
                    <div>
                      <span>
                        {info.currencyName} {amountBigPart}
                      </span>
                      <span className={`${cstyles.small} ${styles.zecsmallpart}`}>{amountSmallPart}</span>
                    </div>
                    {info.currencyName === "ZEC" && (
                      <div className={cstyles.sublight}>{Utils.getZecToUsdString(zecPrice, toAmount)}</div>
                    )}
                  </>
                }
              />

              <Field label="Privacy" value={privacyLevel} />
            </FieldRow>

            <FieldRow>
              <Field
                label="Transaction Fee"
                value={
                  <>
                    {info.currencyName} {Utils.maxPrecisionTrimmed(sendFee)}
                    {info.currencyName === "ZEC" && (
                      <div className={cstyles.sublight}>{Utils.getZecToUsdString(zecPrice, sendFee)}</div>
                    )}
                  </>
                }
              />
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
          </ScrollPaneTop>
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
