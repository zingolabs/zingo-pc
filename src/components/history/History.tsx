import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import cstyles from "../common/Common.module.css";
import styles from "./History.module.css";
import { ValueTransferClass, AddressBookEntryClass, ValueTransferStatusEnum, TotalBalanceClass } from "../appstate";
import ScrollPaneTop from "../scrollPane/ScrollPane";
import VtItemBlock from "./components/VtItemBlock";
import VtModal from "./components/VtModal";
import { BalanceBlock, BalanceBlockHighlight } from "../balanceBlock";
import { ServerHealthLine } from "../serverHealthLine";
import Utils from "../../utils/utils";
import { ContextApp } from "../../context/ContextAppState";

type HistoryProps = {};

const History: React.FC<HistoryProps> = () => {
  const context = useContext(ContextApp);
  const {
    valueTransfers,
    info,
    addressBook,
    totalBalance,
    readOnly,
    fetchError,
    orchardPool,
    saplingPool,
    transparentPool,
    calculateShieldFee,
    handleShieldButton,
    zecPrice,
  } = context;

  const [valueTransferDetail, setValueTransferDetail] = useState<ValueTransferClass | undefined>(undefined);
  const [valueTransferDetailIndex, setValueTransferDetailIndex] = useState<number>(-1);
  const [modalIsOpen, setModalIsOpen] = useState<boolean>(false);
  const [numVtnsToShow, setNumVtnsToShow] = useState<number>(100);
  const [isLoadMoreEnabled, setIsLoadMoreEnabled] = useState<boolean>(false);
  const [valueTransfersSorted, setValueTransfersSorted] = useState<ValueTransferClass[]>([]);
  const [addressBookMap, setAddressBookMap] = useState<Map<string, string>>(new Map());

  const [anyPending, setAnyPending] = useState<boolean>(false);
  const [shieldFee, setShieldFee] = useState<number>(0);

  useEffect(() => {
    // set somePending as well here when I know there is something new in ValueTransfers
    const pending: number =
      valueTransfers.length > 0
        ? valueTransfers
            .filter((vt: ValueTransferClass) => vt.status !== ValueTransferStatusEnum.failed)
            .filter((vt: ValueTransferClass) => vt.confirmations >= 0 && vt.confirmations < 3).length
        : 0;
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
    setIsLoadMoreEnabled(valueTransfers && numVtnsToShow < valueTransfers.length);
  }, [numVtnsToShow, valueTransfers]);

  useEffect(() => {
    setValueTransfersSorted(valueTransfers.slice(0, numVtnsToShow));
  }, [numVtnsToShow, valueTransfers]);

  useEffect(() => {
    setAddressBookMap(
      addressBook.reduce((m: Map<string, string>, obj: AddressBookEntryClass) => {
        m.set(obj.address, obj.label);
        return m;
      }, new Map()),
    );
  }, [addressBook]);

  const totalFunds = useMemo(() => TotalBalanceClass.total(totalBalance), [totalBalance]);

  const confirmedFunds = useMemo(() => TotalBalanceClass.confirmedTotal(totalBalance), [totalBalance]);

  const handleSetValueTransferDetail = useCallback((ttt: ValueTransferClass) => setValueTransferDetail(ttt), []);
  const handleSetValueTransferDetailIndex = useCallback((iii: number) => setValueTransferDetailIndex(iii), []);
  const handleSetModalIsOpen = useCallback((bbb: boolean) => setModalIsOpen(bbb), []);

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
      <div className={`${cstyles.well} ${styles.containermargin}`}>
        <ServerHealthLine />
        <div className={cstyles.balancebox}>
          <BalanceBlockHighlight
            topLabel="All Funds"
            zecValue={totalFunds}
            usdValue={Utils.getZecToUsdString(zecPrice, totalFunds)}
            currencyName={info.currencyName}
            zecValueConfirmed={confirmedFunds}
            usdValueConfirmed={Utils.getZecToUsdString(zecPrice, confirmedFunds)}
          />
          {orchardPool && (
            <BalanceBlock
              topLabel="Ironwood"
              zecValue={totalBalance.totalIronwoodBalance}
              usdValue={Utils.getZecToUsdString(zecPrice, totalBalance.totalIronwoodBalance)}
              currencyName={info.currencyName}
              zecValueConfirmed={totalBalance.confirmedIronwoodBalance}
              usdValueConfirmed={Utils.getZecToUsdString(zecPrice, totalBalance.confirmedIronwoodBalance)}
            />
          )}
          {orchardPool && totalBalance.totalOrchardBalance > 0 && (
            <BalanceBlock
              topLabel="Orchard (legacy)"
              zecValue={totalBalance.totalOrchardBalance}
              usdValue={Utils.getZecToUsdString(zecPrice, totalBalance.totalOrchardBalance)}
              currencyName={info.currencyName}
              zecValueConfirmed={totalBalance.confirmedOrchardBalance}
              usdValueConfirmed={Utils.getZecToUsdString(zecPrice, totalBalance.confirmedOrchardBalance)}
            />
          )}
          {saplingPool && (
            <BalanceBlock
              topLabel="Sapling"
              zecValue={totalBalance.totalSaplingBalance}
              usdValue={Utils.getZecToUsdString(zecPrice, totalBalance.totalSaplingBalance)}
              currencyName={info.currencyName}
              zecValueConfirmed={totalBalance.confirmedSaplingBalance}
              usdValueConfirmed={Utils.getZecToUsdString(zecPrice, totalBalance.confirmedSaplingBalance)}
            />
          )}
          {transparentPool && (
            <BalanceBlock
              topLabel="Transparent"
              zecValue={totalBalance.totalTransparentBalance}
              usdValue={Utils.getZecToUsdString(zecPrice, totalBalance.totalTransparentBalance)}
              currencyName={info.currencyName}
              zecValueConfirmed={totalBalance.confirmedTransparentBalance}
              usdValueConfirmed={Utils.getZecToUsdString(zecPrice, totalBalance.confirmedTransparentBalance)}
            />
          )}
        </div>
        <div className={cstyles.balancebox}>
          {totalBalance.confirmedTransparentBalance >= shieldFee && shieldFee > 0 && !readOnly && !anyPending && (
            <>
              <button className={cstyles.primarybutton} type="button" onClick={handleShieldButton}>
                Shield Transparent Balance To Orchard (Fee: {shieldFee})
              </button>
            </>
          )}
          {!!anyPending && (
            <div className={`${cstyles.red} ${cstyles.small} ${cstyles.padtopsmall}`}>
              Some transactions are pending waiting for the minimum confirmations (3). Balances may change.
            </div>
          )}
        </div>
        {!!fetchError && !!fetchError.error && (
          <>
            <hr />
            <div className={cstyles.balancebox} style={{ color: Utils.getCssVariable("--color-error") }}>
              {fetchError.command + ": " + fetchError.error}
            </div>
          </>
        )}
      </div>

      <div style={{ marginBottom: 5 }} className={`${cstyles.xlarge} ${cstyles.marginnegativetitle} ${cstyles.center}`}>
        History
      </div>

      <ScrollPaneTop offsetHeight={180}>
        {!valueTransfersSorted && <div className={`${cstyles.center} ${cstyles.margintoplarge}`}>Loading...</div>}

        {valueTransfersSorted && valueTransfersSorted.length === 0 && (
          <div className={`${cstyles.center} ${cstyles.margintoplarge}`}>No Transactions Yet</div>
        )}

        {valueTransfersSorted &&
          valueTransfersSorted.length > 0 &&
          valueTransfersSorted.map((vt: ValueTransferClass, index: number) => {
            return (
              <VtItemBlock
                index={index}
                key={`${index}-${vt.type}-${vt.txid}`}
                vt={vt}
                setValueTransferDetail={handleSetValueTransferDetail}
                setValueTransferDetailIndex={handleSetValueTransferDetailIndex}
                setModalIsOpen={handleSetModalIsOpen}
                currencyName={info.currencyName}
                addressBookMap={addressBookMap}
                previousLineWithSameTxid={index === 0 ? false : valueTransfersSorted[index - 1].txid === vt.txid}
              />
            );
          })}

        {isLoadMoreEnabled && (
          <button
            type="button"
            style={{ marginLeft: "45%", width: "100px", marginTop: 15 }}
            className={cstyles.primarybutton}
            onClick={show100MoreVtns}
          >
            Load more
          </button>
        )}
      </ScrollPaneTop>

      {modalIsOpen && (
        <VtModal
          index={valueTransferDetailIndex}
          length={valueTransfersSorted.length}
          totalLength={valueTransfers.length}
          vt={valueTransferDetail}
          modalIsOpen={modalIsOpen}
          closeModal={closeModal}
          currencyName={info.currencyName}
          addressBookMap={addressBookMap}
          valueTransfersSliced={valueTransfersSorted}
        />
      )}
    </div>
  );
};

export default History;
