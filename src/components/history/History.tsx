import React, { useContext, useEffect, useState } from "react";
import cstyles from "../common/Common.module.css";
import styles from "./History.module.css";
import { ValueTransfer, AddressBookEntry } from "../appstate";
import ScrollPane from "../scrollPane/ScrollPane";
import { ZcashURITarget } from "../../utils/uris";
import VtItemBlock from "./components/VtItemBlock";
import VtModal from "./components/VtModal";
import { BalanceBlock, BalanceBlockHighlight } from "../balanceblock";
import Utils from "../../utils/utils";
import { ContextApp } from "../../context/ContextAppState";

type HistoryProps = {
  setSendTo: (targets: ZcashURITarget[] | ZcashURITarget) => void;
};

const History: React.FC<HistoryProps> = ({ setSendTo }) => {
  const context = useContext(ContextApp);
  const { valueTransfers, info, addressBook, totalBalance } = context;

  const [clickedVt, setClickedVt] = useState<ValueTransfer | undefined>(undefined);
  const [modalIsOpen, setModalIsOpen] = useState<boolean>(false);
  const [numTxnsToShow, setNumTxnsToShow] = useState<number>(100);
  const [isLoadMoreEnabled, setIsLoadMoreEnabled] = useState<boolean>(false);
  const [valueTransfersSorted, setValueTransfersSorted] = useState<ValueTransfer[]>([]);
  const [addressBookMap, setAddressBookMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    setIsLoadMoreEnabled(valueTransfers && numTxnsToShow < valueTransfers.length);
  }, [numTxnsToShow, valueTransfers]);

  useEffect(() => {
    setValueTransfersSorted(valueTransfers
    .sort((a: any, b: any) => {
      const timeComparison = b.time - a.time;
      if (timeComparison === 0) {
        // same time
        const txidComparison = a.txid.localeCompare(b.txid);
        if (txidComparison === 0) {
          // same txid
          const aAddress = a.address?.toString() || '';
          const bAddress = b.address?.toString() || '';
          const addressComparison = aAddress.localeCompare(bAddress);
          if (addressComparison === 0) {
            // same address
            const aPoolType = a.poolType?.toString() || '';
            const bPoolType = b.poolType?.toString() || '';
            // last one sort criteria - poolType.
            return aPoolType.localeCompare(bPoolType);
          } else {
            // different address
            return addressComparison;
          }
        } else {
          // different txid
          return txidComparison;
        }
      } else {
        // different time
        return timeComparison;
      }
    })
    .slice(0, numTxnsToShow));  
  }, [numTxnsToShow, valueTransfers]);

  useEffect(() => {
    setAddressBookMap(addressBook.reduce((m: Map<string, string>, obj: AddressBookEntry) => {
      m.set(obj.address, obj.label);
      return m; 
    }, new Map()));
  }, [addressBook]);

  const txClicked = (vt: ValueTransfer) => {
    // Show the modal
    if (!vt) return;
    setClickedVt(vt);
    setModalIsOpen(true);
  };

  const closeModal = () => {
    setClickedVt(undefined);
    setModalIsOpen(false);
  };

  const show100MoreTxns = () => {
    setNumTxnsToShow(numTxnsToShow + 100);
  };

  return (
    <div>
      <div className={[cstyles.well, styles.containermargin].join(" ")}>
        <div className={cstyles.balancebox}>
          <BalanceBlockHighlight
            topLabel="All Funds"
            zecValue={totalBalance.total}
            usdValue={Utils.getZecToUsdString(info.zecPrice, totalBalance.total)}
            currencyName={info.currencyName}
          />
          <BalanceBlock
            topLabel="Orchard"
            zecValue={totalBalance.obalance}
            usdValue={Utils.getZecToUsdString(info.zecPrice, totalBalance.obalance)}
            currencyName={info.currencyName}
          />
          <BalanceBlock
            topLabel="Sapling"
            zecValue={totalBalance.zbalance}
            usdValue={Utils.getZecToUsdString(info.zecPrice, totalBalance.zbalance)}
            currencyName={info.currencyName}
          />
          <BalanceBlock
            topLabel="Transparent"
            zecValue={totalBalance.transparent}
            usdValue={Utils.getZecToUsdString(info.zecPrice, totalBalance.transparent)}
            currencyName={info.currencyName}
          />
        </div>
      </div>

      <div style={{ marginBottom: 5 }} className={[cstyles.xlarge, cstyles.marginnegativetitle, cstyles.center].join(" ")}>History</div>

      {/* Change the hardcoded height */}
      <ScrollPane offsetHeight={180}>
        {!valueTransfersSorted && (
          <div className={[cstyles.center, cstyles.margintoplarge].join(" ")}>Loading...</div>
        )}

        {valueTransfersSorted && valueTransfersSorted.length === 0 && (
          <div className={[cstyles.center, cstyles.margintoplarge].join(" ")}>No Transactions Yet</div>
        )}

        {valueTransfersSorted && valueTransfersSorted.length > 0 &&
          valueTransfersSorted.map((vt: ValueTransfer, index: number) => {
            const key: string = `${index}-${vt.type}-${vt.txid}`;
            return (
              <VtItemBlock
                key={key}
                valueTransfer={vt}
                currencyName={info.currencyName}
                vtClicked={txClicked}
                addressBookMap={addressBookMap}
                previousLineWithSameTxid={
                  index === 0 
                    ? false 
                    : (valueTransfersSorted[index - 1].txid === vt.txid)
                }
              />
            );
          })}

        {isLoadMoreEnabled && (
          <div
            style={{ marginLeft: "45%", width: "100px", marginTop: 15 }}
            className={cstyles.primarybutton}
            onClick={show100MoreTxns}
          >
            Load more
          </div>
        )}
      </ScrollPane>

      <VtModal
        modalIsOpen={modalIsOpen}
        vt={clickedVt}
        closeModal={closeModal}
        currencyName={info.currencyName}
        setSendTo={setSendTo}
        addressBookMap={addressBookMap}
      />
    </div>
  );
};

export default History;
