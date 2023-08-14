import React, { useEffect, useState } from "react";
import Modal from "react-modal";
import { RouteComponentProps, withRouter } from "react-router-dom";
import styles from "../Send.module.css";
import cstyles from "../../common/Common.module.css";
import {
  SendPageState,
  Info,
  TotalBalance,
  SendProgress,
  AddressType,
} from "../../appstate";
import Utils from "../../../utils/utils";
import ScrollPane from "../../scrollPane/ScrollPane";
import routes from "../../../constants/routes.json";
import getSendManyJSON from "./getSendManyJSON";
import SendManyJsonType from "./SendManyJSONType";
import ConfirmModalToAddr from "./ConfirmModalToAddr";

// Internal because we're using withRouter just below
type ConfirmModalProps = {
    sendPageState: SendPageState;
    totalBalance: TotalBalance;
    info: Info;
    sendTransaction: (sendJson: SendManyJsonType[], setSendProgress: (p?: SendProgress) => void) => Promise<string>;
    clearToAddrs: () => void;
    closeModal: () => void;
    modalIsOpen: boolean;
    openErrorModal: (title: string, body: string) => void;
    openPasswordAndUnlockIfNeeded: (successCallback: () => void | Promise<void>) => void;
  };
  
  const ConfirmModalInternal: React.FC<RouteComponentProps & ConfirmModalProps> = ({
    sendPageState,
    totalBalance,
    info,
    sendTransaction,
    clearToAddrs,
    closeModal,
    modalIsOpen,
    openErrorModal,
    openPasswordAndUnlockIfNeeded,
    history,
  }) => {
    const [sendingTotal, setSendingTotal] = useState<number>(0);
    const [bigPart, setBigPart] = useState<string>('');
    const [smallPart, setSmallPart] = useState<string>('');
    const [privacyLevel, setPrivacyLevel] = useState<string>('');

    useEffect(() => {
      (async () => {
        const sendingTotal: number = sendPageState.toaddrs.reduce((s, t) => s + t.amount, 0.0) + info.defaultFee;
        setSendingTotal(sendingTotal);
        const { bigPart, smallPart }: {bigPart: string, smallPart: string} = Utils.splitZecAmountIntoBigSmall(sendingTotal);
        setBigPart(bigPart);
        setSmallPart(smallPart);
      
        // Determine the tx privacy level
        let privacyLevel: string = "";
        // 1. If we're sending to a t-address, it is "transparent" 
        const isToTransparentArray: boolean[] = [];
        sendPageState.toaddrs.forEach(async (to) => {
          const at: AddressType | undefined = await Utils.getAddressType(to.to);
          isToTransparentArray.push(at === AddressType.transparent);
        })
        const isToTransparent: boolean = isToTransparentArray.reduce((p, c) => p || c, false);
        if (isToTransparent) {
          privacyLevel = "Transparent";
        } else {
          // 2. If we're sending to sapling or orchard, and don't have enough funds in the pool, it is "AmountsRevealed"
          const toSaplingArray: number[] = [];
          sendPageState.toaddrs
            .forEach(async (to) => {
              const a: AddressType | undefined = await Utils.getAddressType(to.to);
              toSaplingArray.push(a === AddressType.sapling ? to.amount : 0);
            });
          const toSapling: number = toSaplingArray.reduce((s, c) => s + c, 0);
          const toOrchardArray: number[] = [];
          sendPageState.toaddrs
            .forEach(async(to) => {
              const a: AddressType | undefined = await Utils.getAddressType(to.to);
              toOrchardArray.push(a === AddressType.unified ? to.amount : 0);
            });
          const toOrchard: number = toOrchardArray.reduce((s, c) => s + c, 0);
          if (toSapling > totalBalance.spendableZ || toOrchard > totalBalance.uabalance) {
            privacyLevel = "Amounts Revealed";
          } else {
            // Else, it is a shielded transaction
            privacyLevel = "Shielded";
          }
        }
        setPrivacyLevel(privacyLevel);
      })();
    },[info.defaultFee, sendPageState.toaddrs, totalBalance.spendableZ, totalBalance.uabalance]);
  
    const sendButton = () => {
      // First, close the confirm modal.
      closeModal();
  
      // This will be replaced by either a success TXID or error message that the user
      // has to close manually.
      openErrorModal("Computing Transaction", "Please wait...This could take a while");
      const setSendProgress = (progress?: SendProgress) => {
        if (progress && progress.sendInProgress) {
          openErrorModal(
            `Computing Transaction`,
            `Step ${progress.progress} of ${progress.total}. ETA ${progress.etaSeconds}s`
          );
        }
      };
  
      // Now, send the Tx in a timeout, so that the error modal above has a chance to display 
      setTimeout(() => {
        openPasswordAndUnlockIfNeeded(() => {
          // Then send the Tx async
          (async () => {
            try {
              const sendJson: SendManyJsonType[] = getSendManyJSON(sendPageState);
              const txid: string = await sendTransaction(sendJson, setSendProgress);
  
              openErrorModal(
                "Successfully Broadcast Transaction",
                `Transaction was successfully broadcast.\nTXID: ${txid}`
              );
  
              clearToAddrs();
  
              // Redirect to dashboard after
              history.push(routes.DASHBOARD);
            } catch (err) {
              // If there was an error, show the error modal
              openErrorModal("Error Sending Transaction", `${err}`);
            }
          })();
        });
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
  
                <div className={cstyles.normal}>{Utils.getZecToUsdString(info.zecPrice, sendingTotal)}</div>
              </div>
            </div>
          </div>
  
          <div className={[cstyles.verticalflex, cstyles.margintoplarge].join(" ")}>
            <ScrollPane offsetHeight={350}>
              <div className={[cstyles.verticalflex].join(" ")}>
                {sendPageState.toaddrs.map((t) => (
                  <ConfirmModalToAddr key={t.to} toaddr={t} info={info} />
                ))}
              </div>
              <ConfirmModalToAddr toaddr={{ to: "Fee", amount: info.defaultFee, memo: "", memoReplyTo: "" }} info={info} />
    
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
            </ScrollPane>
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
  
  export default withRouter(ConfirmModalInternal);