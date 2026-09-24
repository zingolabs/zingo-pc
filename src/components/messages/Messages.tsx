import React, { useContext, useEffect, useState } from "react";
import cstyles from "../common/Common.module.css";
import styles from "./Messages.module.css";
import { ValueTransferClass, AddressBookEntryClass, TotalBalanceClass } from "../appstate";
import ScrollPaneBottom from "../scrollPane/ScrollPane";
import { usePaneOffset } from "../scrollPane/usePaneOffset";
import MessagesItemBlock from "./components/MessagesItemBlock";
import { BalanceBlock, BalanceBlockHighlight } from "../balanceBlock";
import Utils from "../../utils/utils";
import { ContextApp } from "../../context/ContextAppState";
import VtModal from "../history/components/VtModal";
import { ShieldBalance } from "../shieldBalance/ShieldBalance";
import { messageMatches } from "../../utils/messageSearch";

type MessagesProps = {};

const Messages: React.FC<MessagesProps> = () => {
  const context = useContext(ContextApp);
  const { messages, info, addressBook, totalBalance, fetchError, orchardPool, saplingPool, transparentPool, zecPrice } =
    context;

  // Measured, as History measures its own: the fixed offset this pane had was
  // shorter than what now sits above it, and the last message ran below the
  // window.
  const { paneRef, paneOffset } = usePaneOffset(203);

  const [valueTransferDetail, setValueTransferDetail] = useState<ValueTransferClass | undefined>(undefined);
  const [valueTransferDetailIndex, setValueTransferDetailIndex] = useState<number>(-1);
  const [modalIsOpen, setModalIsOpen] = useState<boolean>(false);
  const [numVtnsToShow, setNumVtnsToShow] = useState<number>(100);
  const [isLoadMoreEnabled, setIsLoadMoreEnabled] = useState<boolean>(false);
  const [messagesSorted, setMessagesSorted] = useState<ValueTransferClass[]>([]);
  // Searching a long list of memos by their text, or by who they are with.
  const [messageQuery, setMessageQuery] = useState<string>("");

  // Its own list, stepped the same way History steps its own. The modal no
  // longer resolves a step itself, so each screen showing it says what its
  // neighbours are.
  const moveDetail = (delta: number) => {
    setValueTransferDetailIndex((current) => {
      const next = current + delta;
      if (next < 0 || next >= messagesSorted.length) return current;
      setValueTransferDetail(messagesSorted[next]);
      return next;
    });
  };
  const [addressBookMap, setAddressBookMap] = useState<Map<string, string>>(new Map());

  const searching: boolean = messageQuery.trim() !== "";

  useEffect(() => {
    // A search looks through every message, not just the ones loaded so far.
    setIsLoadMoreEnabled(!searching && messages && numVtnsToShow < messages.length);
  }, [numVtnsToShow, messages, searching]);

  useEffect(() => {
    const withMemos = messages.filter((a: ValueTransferClass) => a.memos && a.memos.length > 0 && a.memos.join(""));
    setMessagesSorted(
      searching
        ? withMemos.filter((m: ValueTransferClass) =>
            messageMatches(m, messageQuery, m.address ? addressBookMap.get(m.address) : undefined),
          )
        : withMemos.slice(-numVtnsToShow),
    );
  }, [numVtnsToShow, messages, searching, messageQuery, addressBookMap]);

  useEffect(() => {
    setAddressBookMap(
      addressBook.reduce((m: Map<string, string>, obj: AddressBookEntryClass) => {
        m.set(obj.address, obj.label);
        return m;
      }, new Map()),
    );
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
      <div className={`${cstyles.well} ${styles.containermargin}`}>
        <div className={cstyles.balancebox}>
          <BalanceBlockHighlight
            topLabel="All Funds"
            zecValue={TotalBalanceClass.total(totalBalance)}
            usdValue={Utils.getZecToUsdString(zecPrice, TotalBalanceClass.total(totalBalance))}
            currencyName={info.currencyName}
            zecValueConfirmed={TotalBalanceClass.confirmedTotal(totalBalance)}
            usdValueConfirmed={Utils.getZecToUsdString(zecPrice, TotalBalanceClass.confirmedTotal(totalBalance))}
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
        <ShieldBalance />
        {!!fetchError && !!fetchError.error && (
          <>
            <hr />
            <div className={`${cstyles.balancebox} ${cstyles.fetcherrorbox}`} style={{ color: "var(--color-error)" }}>
              {fetchError.command + ": " + fetchError.error}
            </div>
          </>
        )}
      </div>

      <div style={{ position: "relative" }}>
        <div className={`${cstyles.xlarge} ${cstyles.screentitle} ${cstyles.center}`}>Messages</div>
        {/* Right of the title, where History keeps its own list control. */}
        <div
          className={cstyles.fieldrow}
          style={{
            position: "absolute",
            right: 16,
            marginRight: 20,
            top: "50%",
            transform: "translateY(-50%)",
            width: 240,
          }}
        >
          <input
            type="search"
            aria-label="Search messages"
            className={cstyles.fieldinput}
            style={{ fontSize: 14 }}
            value={messageQuery}
            onChange={(e) => setMessageQuery(e.target.value)}
            placeholder="Search messages"
          />
        </div>
      </div>

      <div ref={paneRef}>
        <ScrollPaneBottom offsetHeight={paneOffset} initialScrollType="bottom">
          {!messagesSorted && <div className={`${cstyles.center} ${cstyles.margintoplarge}`}>Loading...</div>}

          {messagesSorted && messagesSorted.length === 0 && (
            <div className={`${cstyles.center} ${cstyles.margintoplarge}`}>
              {searching ? "No messages match that." : "No Transactions Yet"}
            </div>
          )}

          {messagesSorted && messagesSorted.length > 0 && isLoadMoreEnabled && (
            <button
              type="button"
              style={{ marginLeft: "45%", width: "100px", marginTop: 15, marginBottom: 15 }}
              className={cstyles.primarybutton}
              onClick={show100MoreVtns}
            >
              Load more
            </button>
          )}

          {messagesSorted &&
            messagesSorted.length > 0 &&
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
                  previousLineWithSameTxid={index === 0 ? false : messagesSorted[index - 1].txid === vt.txid}
                />
              );
            })}
        </ScrollPaneBottom>
      </div>

      {modalIsOpen && (
        <VtModal
          key={valueTransferDetailIndex}
          index={valueTransferDetailIndex}
          moveDetail={moveDetail}
          length={messagesSorted.length}
          totalLength={messages.length}
          vt={valueTransferDetail}
          modalIsOpen={modalIsOpen}
          closeModal={closeModal}
          currencyName={info.currencyName}
          addressBookMap={addressBookMap}
          valueTransfersSliced={messagesSorted}
        />
      )}
    </div>
  );
};

export default Messages;
