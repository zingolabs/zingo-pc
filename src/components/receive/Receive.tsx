import React, { useContext, useEffect, useState } from "react";
import { Tab, Tabs, TabList, TabPanel } from "react-tabs";
import { Accordion } from "react-accessible-accordion";
import styles from "./Receive.module.css";
import cstyles from "../common/Common.module.css";
import {
  AddressBookEntryClass,
  AddressScopeEnum,
  TotalBalanceClass,
  TransparentAddressClass,
  UnifiedAddressClass,
  ValueTransferClass,
  ValueTransferStatusEnum,
} from "../appstate";
import ScrollPaneTop from "../scrollPane/ScrollPane";
import { usePaneOffset } from "../scrollPane/usePaneOffset";
import AddressBlock from "./components/AddressBlock";
import { ContextApp } from "../../context/ContextAppState";
import { BalanceBlock, BalanceBlockHighlight } from "../balanceBlock";
import Utils from "../../utils/utils";
import { matchesAllWords } from "../../utils/textSearch";
import { ShieldBalance } from "../shieldBalance/ShieldBalance";

type ReceiveProps = {};

const Receive: React.FC<ReceiveProps> = () => {
  const context = useContext(ContextApp);
  const {
    addressesUnified,
    addressesTransparent,
    addressBook,
    info,
    orchardPool,
    saplingPool,
    transparentPool,
    calculateShieldFee,
    totalBalance,
    valueTransfers,
    readOnly,
    fetchError,
    zecPrice,
  } = context;

  // The block above the tabs varies with the wallet: the shield button, the
  // pending notice and the fetch error each add a line the constant could not
  // follow, and when it came out too small the last address fell off the
  // bottom of the pane.
  //
  // One per tab, because a single ref would be handed to whichever panel
  // rendered last. They measure the same thing today; each measuring its own
  // costs nothing and does not assume they always will.
  const unified = usePaneOffset(180);
  const transparent = usePaneOffset(180);

  const [uaddrs, setUaddrs] = useState<UnifiedAddressClass[]>([]);
  const [taddrs, setTaddrs] = useState<TransparentAddressClass[]>([]);
  const [addressBookMap, setAddressBookMap] = useState<Map<string, string>>(new Map());
  // One search for both tabs, beside them: it runs over the unified and the
  // transparent addresses at once, so switching tab with a search in place
  // shows what that tab has to show for it. Offered only when some tab has
  // more than one address; with a single one there is nothing to narrow.
  const [query, setQuery] = useState<string>("");
  const matching = <T extends { encoded_address: string }>(addresses: T[], query: string): T[] =>
    addresses.filter((a) =>
      matchesAllWords(`${a.encoded_address} ${addressBookMap.get(a.encoded_address) ?? ""}`, query),
    );
  const shownUaddrs = matching(uaddrs, query);
  const shownTaddrs = matching(taddrs, query);
  // The first address of the list on screen is the open one, whether the list
  // is the whole book or what a search left. `preExpanded` is read once, when
  // the accordion mounts, so keying it by that address is what reopens the
  // first of a new list; a list whose first address did not change keeps
  // whatever the user has open.
  const firstUaddr = shownUaddrs.length > 0 ? shownUaddrs[0].encoded_address : "";
  const firstTaddr = shownTaddrs.length > 0 ? shownTaddrs[0].encoded_address : "";

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
    // with confirmed transparent funds & no readonly wallet
    if (totalBalance.confirmedTransparentBalance > 0 && !readOnly && !anyPending) {
      (async () => {
        setShieldFee(await calculateShieldFee());
      })();
    }
  }, [totalBalance.confirmedTransparentBalance, anyPending, calculateShieldFee, readOnly]);

  useEffect(() => {
    setUaddrs([...addressesUnified].reverse());
  }, [addressesUnified]);

  useEffect(() => {
    setTaddrs(
      [...addressesTransparent.filter((t: TransparentAddressClass) => t.scope === AddressScopeEnum.external)].reverse(),
    );
  }, [addressesTransparent]);

  useEffect(() => {
    const _addressBookMap = addressBook.reduce((m: Map<string, string>, obj: AddressBookEntryClass) => {
      m.set(obj.address, obj.label);
      return m;
    }, new Map());
    setAddressBookMap(_addressBookMap);
  }, [addressBook]);

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
        <ShieldBalance shieldFee={shieldFee} anyPending={anyPending} />
        {!!fetchError && !!fetchError.error && (
          <>
            <hr />
            <div className={`${cstyles.balancebox} ${cstyles.fetcherrorbox}`} style={{ color: "var(--color-error)" }}>
              {fetchError.command + ": " + fetchError.error}
            </div>
          </>
        )}
      </div>
      <div className={styles.containermargin} style={{ marginLeft: 20, position: "relative" }}>
        {/* Beside the tabs rather than inside one of them: the search runs over
            both, so a tab switched with a search in place answers for itself. */}
        {(uaddrs.length > 1 || taddrs.length > 1) && (
          <div className={cstyles.fieldrow} style={{ position: "absolute", top: 0, right: 16, width: 240, zIndex: 1 }}>
            <input
              type="search"
              aria-label="Search addresses"
              className={cstyles.fieldinput}
              style={{ fontSize: 14 }}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by address or name"
            />
          </div>
        )}
        <Tabs>
          <TabList>
            {/* The count beside the name, so the size of each list is known
                before opening it. */}
            {(orchardPool || saplingPool) && <Tab>{`Unified (${uaddrs.length})`}</Tab>}
            {transparentPool && <Tab>{`Transparent (${taddrs.length})`}</Tab>}
          </TabList>

          <TabPanel>
            {(orchardPool || saplingPool) && !!uaddrs && uaddrs.length > 0 && (
              <div ref={unified.paneRef}>
                <ScrollPaneTop offsetHeight={unified.paneOffset}>
                  <Accordion key={firstUaddr} preExpanded={[firstUaddr]}>
                    {shownUaddrs.length === 0 && (
                      <div className={`${cstyles.center} ${cstyles.sublight} ${cstyles.margintoplarge}`}>
                        No addresses match that.
                      </div>
                    )}
                    {shownUaddrs.map((a: UnifiedAddressClass, i: number) => (
                      <AddressBlock
                        key={`u-${a.encoded_address}`}
                        address={a}
                        currencyName={info.currencyName}
                        label={addressBookMap.get(a.encoded_address)}
                        type={"u"}
                        position={i + 1}
                        total={shownUaddrs.length}
                      />
                    ))}
                  </Accordion>
                </ScrollPaneTop>
              </div>
            )}
          </TabPanel>

          <TabPanel>
            {transparentPool && !!taddrs && taddrs.length > 0 && (
              <div ref={transparent.paneRef}>
                <ScrollPaneTop offsetHeight={transparent.paneOffset}>
                  <Accordion key={firstTaddr} preExpanded={[firstTaddr]}>
                    {shownTaddrs.length === 0 && (
                      <div className={`${cstyles.center} ${cstyles.sublight} ${cstyles.margintoplarge}`}>
                        No addresses match that.
                      </div>
                    )}
                    {shownTaddrs.map((a: TransparentAddressClass, i: number) => (
                      <AddressBlock
                        key={`t-${a.encoded_address}`}
                        address={a}
                        currencyName={info.currencyName}
                        label={addressBookMap.get(a.encoded_address)}
                        type={"t"}
                        position={i + 1}
                        total={shownTaddrs.length}
                      />
                    ))}
                  </Accordion>
                </ScrollPaneTop>
              </div>
            )}
          </TabPanel>
        </Tabs>
      </div>
    </div>
  );
};

export default Receive;
