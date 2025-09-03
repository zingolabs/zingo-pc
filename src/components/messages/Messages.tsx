import React, { useContext, useEffect, useState } from "react";
import cstyles from "../common/Common.module.css";
import styles from "./Messages.module.css";
import { ValueTransferClass, AddressBookEntryClass } from "../appstate";
import ScrollPaneBottom from "../scrollPane/ScrollPane";
import { ZcashURITarget } from "../../utils/uris";
import MessagesItemBlock from "./components/MessagesItemBlock";
import { BalanceBlock, BalanceBlockHighlight } from "../balanceblock";
import Utils from "../../utils/utils";
import { ContextApp } from "../../context/ContextAppState";
import VtModal from "../history/components/VtModal";

type MessagesProps = {
  setSendTo: (targets: ZcashURITarget[] | ZcashURITarget) => void;
  calculateShieldFee: () => Promise<number>;
  handleShieldButton: () => void;
  openErrorModal: (title: string, body: string | JSX.Element) => void;
  openConfirmModal: (title: string, body: string | JSX.Element, action: () => void) => void;
  setAddLabel: (l: AddressBookEntryClass) => void;
};

const Messages: React.FC<MessagesProps> = ({ setSendTo, calculateShieldFee, handleShieldButton, openErrorModal, openConfirmModal, setAddLabel }) => {
  const context = useContext(ContextApp);
  const { messages, info, addressBook, totalBalance, readOnly, fetchError, valueTransfers, orchardPool, saplingPool, transparentPool } = context;

  const [valueTransferDetail, setValueTransferDetail] = useState<ValueTransferClass | undefined>(undefined);
  const [valueTransferDetailIndex, setValueTransferDetailIndex] = useState<number>(-1);
  const [modalIsOpen, setModalIsOpen] = useState<boolean>(false);
  const [numVtnsToShow, setNumVtnsToShow] = useState<number>(100);
  const [isLoadMoreEnabled, setIsLoadMoreEnabled] = useState<boolean>(false);
  const [messagesSorted, setMessagesSorted] = useState<ValueTransferClass[]>([]);
  const [addressBookMap, setAddressBookMap] = useState<Map<string, string>>(new Map());

  const [anyPending, setAnyPending] = useState<boolean>(false);
  const [shieldFee, setShieldFee] = useState<number>(0);

  useEffect(() => {
    // set somePending as well here when I know there is something new in ValueTransfers
    const pending: number =
      valueTransfers.length > 0 ? valueTransfers.filter((vt: ValueTransferClass) => vt.confirmations >= 0 && vt.confirmations < 3).length : 0;
    setAnyPending(pending > 0);
  }, [valueTransfers]);
    
  useEffect(() => {
    if (totalBalance.confirmedTransparentBalance > 0 && calculateShieldFee && !readOnly && !anyPending) {
      (async () => {
        setShieldFee(await calculateShieldFee());
      })();
    }
  }, [totalBalance.confirmedTransparentBalance, anyPending, calculateShieldFee, readOnly]); 

  useEffect(() => {
    setIsLoadMoreEnabled(messages && numVtnsToShow < messages.length);
  }, [numVtnsToShow, messages]);

  useEffect(() => {
    setMessagesSorted(messages
      .filter((a: ValueTransferClass) => a.memos && a.memos.length > 0 && a.memos.join(''))
      .slice(-numVtnsToShow));  
  }, [numVtnsToShow, messages]);

  useEffect(() => {
    setAddressBookMap(addressBook.reduce((m: Map<string, string>, obj: AddressBookEntryClass) => {
      m.set(obj.address, obj.label);
      return m; 
    }, new Map()));
  }, [addressBook]);

  const closeModal = () => {
    setValueTransferDetail(undefined);
    setValueTransferDetailIndex(-1);
    setModalIsOpen(false);
  };

  const show100MoreVtns = () => {
    setNumVtnsToShow(numVtnsToShow + 100);
  };

  return (
    <div>
      <div className={[cstyles.well, styles.containermargin].join(" ")}>
        <div className={cstyles.balancebox}>
          <BalanceBlockHighlight
            topLabel="All Funds"
            zecValue={totalBalance.totalOrchardBalance + totalBalance.totalSaplingBalance + totalBalance.totalTransparentBalance}
            usdValue={Utils.getZecToUsdString(info.zecPrice, totalBalance.totalOrchardBalance + totalBalance.totalSaplingBalance + totalBalance.totalTransparentBalance)}
            currencyName={info.currencyName}
            zecValueConfirmed={totalBalance.confirmedOrchardBalance + totalBalance.confirmedSaplingBalance + totalBalance.confirmedTransparentBalance}
            usdValueConfirmed={Utils.getZecToUsdString(info.zecPrice, totalBalance.confirmedOrchardBalance + totalBalance.confirmedSaplingBalance + totalBalance.confirmedTransparentBalance)}            
          />
          {orchardPool && (
            <BalanceBlock
              topLabel="Orchard"
              zecValue={totalBalance.totalOrchardBalance}
              usdValue={Utils.getZecToUsdString(info.zecPrice, totalBalance.totalOrchardBalance)}
              currencyName={info.currencyName}
              zecValueConfirmed={totalBalance.confirmedOrchardBalance}
              usdValueConfirmed={Utils.getZecToUsdString(info.zecPrice, totalBalance.confirmedOrchardBalance)}
            />
          )}
          {saplingPool && (
            <BalanceBlock
              topLabel="Sapling"
              zecValue={totalBalance.totalSaplingBalance}
              usdValue={Utils.getZecToUsdString(info.zecPrice, totalBalance.totalSaplingBalance)}
              currencyName={info.currencyName}
              zecValueConfirmed={totalBalance.confirmedSaplingBalance}
              usdValueConfirmed={Utils.getZecToUsdString(info.zecPrice, totalBalance.confirmedSaplingBalance)}
            />
          )}
          {transparentPool && (
            <BalanceBlock
              topLabel="Transparent"
              zecValue={totalBalance.totalTransparentBalance}
              usdValue={Utils.getZecToUsdString(info.zecPrice, totalBalance.totalTransparentBalance)}
              currencyName={info.currencyName}
              zecValueConfirmed={totalBalance.confirmedTransparentBalance}
              usdValueConfirmed={Utils.getZecToUsdString(info.zecPrice, totalBalance.confirmedTransparentBalance)}
            />
          )}
        </div>
        <div className={cstyles.balancebox}>
          {totalBalance.confirmedTransparentBalance >= shieldFee && shieldFee > 0 && !readOnly && !anyPending &&  (
            <>
              <button className={[cstyles.primarybutton].join(" ")} type="button" onClick={handleShieldButton}>
                Shield Transparent Balance To Orchard (Fee: {shieldFee})
              </button>
            </>
          )}
          {!!anyPending && (
            <div className={[cstyles.red, cstyles.small, cstyles.padtopsmall].join(" ")}>
              Some transactions are pending waiting for the minimum confirmations (3). Balances may change.
            </div>
          )}
        </div>
        {!!fetchError && !!fetchError.error && (
          <>
            <hr />
            <div className={cstyles.balancebox} style={{ color: Utils.getCssVariable('--color-error') }}>
              {fetchError.command + ': ' + fetchError.error}
            </div>
          </>
        )}
      </div>

      <div style={{ marginBottom: 5 }} className={[cstyles.xlarge, cstyles.marginnegativetitle, cstyles.center].join(" ")}>Messages</div>

      <ScrollPaneBottom offsetHeight={180} initialScrollType='bottom'>
        {!messagesSorted && (
          <div className={[cstyles.center, cstyles.margintoplarge].join(" ")}>Loading...</div>
        )}

        {messagesSorted && messagesSorted.length === 0 && (
          <div className={[cstyles.center, cstyles.margintoplarge].join(" ")}>No Transactions Yet</div>
        )}

        {messagesSorted && messagesSorted.length > 0 && isLoadMoreEnabled && (
          <div
            style={{ marginLeft: "45%", width: "100px", marginTop: 15, marginBottom: 15 }}
            className={cstyles.primarybutton}
            onClick={show100MoreVtns}
          >
            Load more
          </div>
        )}

        {messagesSorted && messagesSorted.length > 0 &&
          messagesSorted.map((vt: ValueTransferClass, index: number) => {
            return (
              <MessagesItemBlock
                index={index}
                key={`${index}-${vt.type}-${vt.txid}`}
                vt={vt}
                setValueTransferDetail={(ttt: ValueTransferClass) => setValueTransferDetail(ttt)}
                setValueTransferDetailIndex={(iii: number) => setValueTransferDetailIndex(iii)}
                setModalIsOpen={(bbb: boolean) => setModalIsOpen(bbb)}  
                currencyName={info.currencyName}
                addressBookMap={addressBookMap}
                previousLineWithSameTxid={
                  index === 0 
                    ? false 
                    : (messagesSorted[index - 1].txid === vt.txid)
                }
              />
            );
          })}
      </ScrollPaneBottom>

      {modalIsOpen && (
        <VtModal
          index={valueTransferDetailIndex}
          length={messagesSorted.length}
          totalLength={messages.length}
          vt={valueTransferDetail}
          modalIsOpen={modalIsOpen}
          closeModal={closeModal}
          currencyName={info.currencyName}
          setSendTo={setSendTo}
          addressBookMap={addressBookMap}
          valueTransfersSliced={messagesSorted}
          openErrorModal={openErrorModal}
          openConfirmModal={openConfirmModal}
          setAddLabel={setAddLabel}
        />
      )}
    </div>
  );
};

export default Messages;
