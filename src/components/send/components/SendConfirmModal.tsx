import React, { useCallback, useContext, useEffect, useState } from "react";
import Modal from "react-modal";
import { RouteComponentProps, withRouter } from "react-router-dom";
import styles from "../Send.module.css";
import cstyles from "../../common/Common.module.css";
import {
  SendPageStateClass,
  InfoClass,
  TotalBalanceClass,
  AddressKindEnum,
  ToAddrClass,
  ServerChainNameEnum,
} from "../../appstate";
import Utils from "../../../utils/utils";
import ScrollPaneTop from "../../scrollPane/ScrollPane";
import routes from "../../../constants/routes.json";
import getSendManyJSON from "./getSendManyJSON";
import SendManyJsonType from "./SendManyJSONType";
import ConfirmModalToAddr from "./SendConfirmModalToAddr";

import { native } from "../../../electronBridge";
import { ContextApp } from "../../../context/ContextAppState";

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

const SendConfirmModal: React.FC<RouteComponentProps & SendConfirmModalProps> = ({
  sendPageState,
  totalBalance,
  info,
  sendTransaction,
  clearToAddrs,
  closeModal,
  modalIsOpen,
  history,
  sendFee,
}) => {
  const context = useContext(ContextApp);
  const {
    currentWallet,
    openErrorModal,
    blockExplorerMainnetTransaction,
    blockExplorerTestnetTransaction,
    blockExplorerMainnetTransactionCustom,
    blockExplorerTestnetTransactionCustom,
  } = context;

  const [sendingTotal, setSendingTotal] = useState<number>(0);
  const [bigPart, setBigPart] = useState<string>("");
  const [smallPart, setSmallPart] = useState<string>("");
  const [privacyLevel, setPrivacyLevel] = useState<string>("");

  const getPrivacyLevel = useCallback(
    async (toaddr: ToAddrClass) => {
      if (!toaddr.to) {
        return "-";
      }

      let from: "orchard" | "orchard+sapling" | "sapling" | "" = "";
      // amount + fee
      if (Number(toaddr.amount) + sendFee <= totalBalance.confirmedOrchardBalance) {
        from = "orchard";
      } else if (
        totalBalance.confirmedOrchardBalance > 0 &&
        Number(toaddr.amount) + sendFee <= totalBalance.confirmedOrchardBalance + totalBalance.confirmedSaplingBalance
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
        if (!result || result.toLowerCase().startsWith("error")) {
          return "-";
        }

        try {
          resultJSON = await JSON.parse(result);
        } catch (error) {
          console.log("parse-address", error);
          return "-";
        }
      } catch (error) {
        console.log(`Critical Error parse address ${error}`);
        return "-";
      }

      //console.log('parse-address', address, resultJSON.status === 'success');

      const currChain = currentWallet ? currentWallet.chain_name : ServerChainNameEnum.mainChainName;

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

      //console.log(from, result, resultJSON);

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
    [sendFee, totalBalance.confirmedOrchardBalance, totalBalance.confirmedSaplingBalance, currentWallet],
  );

  useEffect(() => {
    const sendingTotal: number = sendPageState.toaddr.amount + sendFee;
    setSendingTotal(sendingTotal);
    const { bigPart, smallPart }: { bigPart: string; smallPart: string } =
      Utils.splitZecAmountIntoBigSmall(sendingTotal);
    setBigPart(bigPart);
    setSmallPart(smallPart);
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

        if (!txidsResult || txidsResult.toLowerCase().startsWith("error")) {
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
                  <div
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
                    <i className={["fas", "fa-external-link-square-alt"].join(" ")} />
                  </div>
                  {txids.length > 1 && (
                    <div
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
                      <i className={["fas", "fa-external-link-square-alt"].join(" ")} />
                    </div>
                  )}
                  {txids.length > 2 && (
                    <div
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
                      <i className={["fas", "fa-external-link-square-alt"].join(" ")} />
                    </div>
                  )}
                </div>
              )}
            </div>,
          );
        }

        clearToAddrs();

        // Redirect to dashboard after
        history.push(routes.DASHBOARD);
      } catch (err) {
        // If there was an error, show the error modal
        openErrorModal("Error Sending Transaction", `${err}`);
      }
    }, 10);
  };

  return (
    <Modal
      isOpen={modalIsOpen}
      onRequestClose={closeModal}
      className={styles.confirmModal}
      overlayClassName={styles.confirmOverlay}
    >
      <div className={[cstyles.verticalflex].join(" ")}>
        <div className={[cstyles.marginbottomlarge, cstyles.center].join(" ")}>Confirm Transaction</div>
        <div className={cstyles.flex}>
          <div
            className={[
              cstyles.highlight,
              cstyles.xlarge,
              cstyles.flexspacebetween,
              cstyles.well,
              cstyles.maxwidth,
            ].join(" ")}
          >
            <div>Total</div>
            <div className={[cstyles.right, cstyles.verticalflex].join(" ")}>
              <div>
                <span>
                  {info.currencyName} {bigPart}
                </span>
                <span className={[cstyles.small, styles.zecsmallpart].join(" ")}>{smallPart}</span>
              </div>
              {info.currencyName === "ZEC" && (
                <div className={cstyles.normal}>{Utils.getZecToUsdString(info.zecPrice, sendingTotal)}</div>
              )}
            </div>
          </div>
        </div>

        <div className={[cstyles.verticalflex, cstyles.margintoplarge].join(" ")}>
          <ScrollPaneTop offsetHeight={350}>
            <div className={[cstyles.verticalflex].join(" ")}>
              {[sendPageState.toaddr].map((t) => (
                <ConfirmModalToAddr key={t.to} toaddr={t} info={info} />
              ))}
            </div>
            <ConfirmModalToAddr toaddr={{ to: "Fee", amount: sendFee, memo: "", memoReplyTo: "" }} info={info} />

            <div className={cstyles.well}>
              <div className={[cstyles.flexspacebetween, cstyles.margintoplarge].join(" ")}>
                <div className={[styles.confirmModalAddress].join(" ")}>Privacy Level</div>
                <div className={[cstyles.verticalflex, cstyles.right].join(" ")}>
                  <div className={cstyles.large}>
                    <div>
                      <span>{privacyLevel}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </ScrollPaneTop>
        </div>

        <div className={cstyles.buttoncontainer}>
          <button type="button" className={cstyles.primarybutton} onClick={() => sendButton()}>
            Send
          </button>
          <button type="button" className={cstyles.primarybutton} onClick={closeModal}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default withRouter(SendConfirmModal);
