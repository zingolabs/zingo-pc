import React, { useCallback, useEffect, useState } from "react";
import Modal from "react-modal";
import { RouteComponentProps, withRouter } from "react-router-dom";
import styles from "../Send.module.css";
import cstyles from "../../common/Common.module.css";
import {
  SendPageState,
  Info,
  TotalBalance,
  SendProgress,
} from "../../appstate";
import Utils from "../../../utils/utils";
import ScrollPane from "../../scrollPane/ScrollPane";
import routes from "../../../constants/routes.json";
import getSendManyJSON from "./getSendManyJSON";
import SendManyJsonType from "./SendManyJSONType";
import ConfirmModalToAddr from "./ConfirmModalToAddr";
import native from "../../../native.node";

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

    const getPrivacyLevel = useCallback(async (toaddr) => {
  
      let from: 'orchard' | 'orchard+sapling' | 'sapling' | '' = '';
      // amount + fee
      if (Number(toaddr.amount) + info.defaultFee <= totalBalance.spendableO) {
        from = 'orchard';
      } else if (
        totalBalance.spendableO > 0 &&
        Number(toaddr.amount) + info.defaultFee <= totalBalance.spendableO + totalBalance.spendableZ
      ) {
        from = 'orchard+sapling';
      } else if (Number(toaddr.amount) + info.defaultFee <= totalBalance.spendableZ) {
        from = 'sapling';
      }
  
      if (from === '') {
        return '-';
      }
  
      const result: string = await native.zingolib_execute_async('parse_address', toaddr.to);
      if (result) {
        if (result.toLowerCase().startsWith('error') || result.toLowerCase() === 'null') {
          return '-';
        }
      } else {
        return '-';
      }
      // TODO: check if the json parse is correct.
      const resultJSON = await JSON.parse(result);
  
      //console.log('parse-address', address, resultJSON.status === 'success');
  
      if (resultJSON.status !== 'success') {
        return '-';
      }
  
      //console.log(from, result, resultJSON);
  
      // Private -> orchard to orchard (UA with orchard receiver)
      if (
        from === 'orchard' &&
        resultJSON.address_kind === 'unified' &&
        resultJSON.receivers_available?.includes('orchard')
      ) {
        return 'Private';
      }
  
      // Private -> sapling to sapling (ZA or UA with sapling receiver and NO orchard receiver)
      if (
        from === 'sapling' &&
        (resultJSON.address_kind === 'sapling' ||
          (resultJSON.address_kind === 'unified' &&
            resultJSON.receivers_available?.includes('sapling') &&
            !resultJSON.receivers_available?.includes('orchard')))
      ) {
        return 'Private';
      }
  
      // Amount Revealed -> orchard to sapling (ZA or UA with sapling receiver)
      if (
        from === 'orchard' &&
        (resultJSON.address_kind === 'sapling' ||
          (resultJSON.address_kind === 'unified' && resultJSON.receivers_available?.includes('sapling')))
      ) {
        return 'Amount Revealed';
      }
  
      // Amount Revealed -> sapling to orchard (UA with orchard receiver)
      if (
        from === 'sapling' &&
        resultJSON.address_kind === 'unified' &&
        resultJSON.receivers_available?.includes('orchard')
      ) {
        return 'Amount Revealed';
      }
  
      // Amount Revealed -> sapling+orchard to orchard or sapling (UA with orchard receiver or ZA or
      // UA with sapling receiver)
      if (
        from === 'orchard+sapling' &&
        (resultJSON.address_kind === 'sapling' ||
          (resultJSON.address_kind === 'unified' &&
            (resultJSON.receivers_available?.includes('orchard') || resultJSON.receivers_available?.includes('sapling'))))
      ) {
        return 'Amount Revealed';
      }
  
      // Deshielded -> orchard or sapling or orchard+sapling to transparent
      if (
        (from === 'orchard' || from === 'sapling' || from === 'orchard+sapling') &&
        resultJSON.address_kind === 'transparent'
      ) {
        return 'Deshielded';
      }
  
      // whatever else
      return '-';
    }, [info.defaultFee, totalBalance.spendableZ, totalBalance.spendableO]);

    useEffect(() => {
      (async () => {
        const sendingTotal: number = sendPageState.toaddrs.reduce((s, t) => s + t.amount, 0.0) + info.defaultFee;
        setSendingTotal(sendingTotal);
        const { bigPart, smallPart }: {bigPart: string, smallPart: string} = Utils.splitZecAmountIntoBigSmall(sendingTotal);
        setBigPart(bigPart);
        setSmallPart(smallPart);
      
        setPrivacyLevel(await getPrivacyLevel(sendPageState.toaddrs[0]));
      })();
    },[getPrivacyLevel, info.defaultFee, sendPageState.toaddrs]);
  
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