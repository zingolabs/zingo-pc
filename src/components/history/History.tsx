import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import cstyles from "../common/Common.module.css";
import styles from "./History.module.css";
import { ValueTransferClass, AddressBookEntryClass, ValueTransferStatusEnum, TotalBalanceClass } from "../appstate";
import ScrollPaneTop from "../scrollPane/ScrollPane";
import { usePaneOffset } from "../scrollPane/usePaneOffset";
import VtItemBlock from "./components/VtItemBlock";
import VtModal from "./components/VtModal";
import { BalanceBlock, BalanceBlockHighlight } from "../balanceBlock";
import Utils from "../../utils/utils";
import { ContextApp } from "../../context/ContextAppState";
import { useSwapRecords, useValueTransfersWithSwaps } from "../../context/ContextSwapService";
import { SwapStore } from "../../swap";
import { ValueTransferKindEnum } from "../appstate";
import SwapDetailModal from "../swap/SwapDetailModal";

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

  const swapRecords = useSwapRecords();

  // The block above the list has no fixed height. The balance row gains and
  // loses a block with the wallet's pools, the shield button comes and goes
  // with a transparent balance, and the pending notice and the fetch error each
  // add a line of their own, so a constant offset was right for one wallet and
  // wrong for the next.
  const { paneRef, paneOffset } = usePaneOffset(203);

  const mergedValueTransfers = useValueTransfersWithSwaps(valueTransfers);

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
    setIsLoadMoreEnabled(mergedValueTransfers && numVtnsToShow < mergedValueTransfers.length);
  }, [numVtnsToShow, mergedValueTransfers]);

  useEffect(() => {
    setValueTransfersSorted(mergedValueTransfers.slice(0, numVtnsToShow));
  }, [numVtnsToShow, mergedValueTransfers]);

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

  // A swap row opens its own detail rather than the transfer modal: its fields
  // are the record's, not zingolib's, and the transfer modal's txid actions
  // would be reading a deposit address. Read from `swapRecords` on every render
  // so a poller tick reaches an open detail without reopening it.
  const swapDetailRecord = useMemo(() => {
    if (valueTransferDetail?.type !== ValueTransferKindEnum.swap) return undefined;
    return swapRecords.find((r) => r.recordId === valueTransferDetail.swapRecordId);
  }, [valueTransferDetail, swapRecords]);

  const removeSwapRecord = useCallback(async (recordId: string) => {
    closeModal();
    try {
      await SwapStore.deleteByRecordId(recordId);
    } catch (error) {
      console.error(`History: removing the swap record failed ${error}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Step the open detail to its neighbour in the list on screen.
   *
   * Lives here because this is where the list is and where the choice of
   * detail view is made: setting the row is enough for a swap to open the swap
   * detail and a transfer the transfer one, so the stepper crosses between them
   * without either modal knowing the other exists. It used to live inside
   * `VtModal`, which resolved each step against zingolib's transfers alone and
   * closed itself on reaching a swap.
   */
  const moveDetail = useCallback(
    (delta: number) => {
      setValueTransferDetailIndex((current) => {
        const next = current + delta;
        if (next < 0 || next >= valueTransfersSorted.length) return current;
        setValueTransferDetail(valueTransfersSorted[next]);
        return next;
      });
    },
    [valueTransfersSorted],
  );

  const show100MoreVtns = () => {
    setNumVtnsToShow(numVtnsToShow + 100);
  };

  return (
    <div>
      <div className={`${cstyles.well} ${styles.containermargin}`}>
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
                Shield Transparent Balance (Fee: {shieldFee})
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
            <div className={cstyles.balancebox} style={{ color: "var(--color-error)" }}>
              {fetchError.command + ": " + fetchError.error}
            </div>
          </>
        )}
      </div>

      <div className={`${cstyles.xlarge} ${cstyles.screentitle} ${cstyles.center}`}>History</div>

      <div ref={paneRef}>
        <ScrollPaneTop offsetHeight={paneOffset}>
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
      </div>

      {modalIsOpen && swapDetailRecord && (
        <SwapDetailModal
          record={swapDetailRecord}
          index={valueTransferDetailIndex}
          length={valueTransfersSorted.length}
          moveDetail={moveDetail}
          modalIsOpen={modalIsOpen}
          closeModal={closeModal}
          onRemove={(r) => removeSwapRecord(r.recordId)}
        />
      )}

      {modalIsOpen && !swapDetailRecord && (
        <VtModal
          // Remounted per row: the stepper now lives in History, and a fresh
          // mount is what re-seeds the modal internals from the row it landed
          // on rather than the one it opened with.
          key={valueTransferDetailIndex}
          index={valueTransferDetailIndex}
          moveDetail={moveDetail}
          length={valueTransfersSorted.length}
          totalLength={mergedValueTransfers.length}
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
