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
import AddressBlock from "./components/AddressBlock";
import { ContextApp } from "../../context/ContextAppState";
import { BalanceBlock, BalanceBlockHighlight } from "../balanceBlock";
import Utils from "../../utils/utils";

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
    handleShieldButton,
    totalBalance,
    valueTransfers,
    readOnly,
    fetchError,
    zecPrice,
  } = context;

  const [uaddrs, setUaddrs] = useState<UnifiedAddressClass[]>([]);
  const [defaultUaddr, setDefaultUaddr] = useState<string>("");
  const [taddrs, setTaddrs] = useState<TransparentAddressClass[]>([]);
  const [defaultTaddr, setDefaultTaddr] = useState<string>("");
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
    // with confirmed transparent funds & no readonly wallet
    if (totalBalance.confirmedTransparentBalance > 0 && !readOnly && !anyPending) {
      (async () => {
        setShieldFee(await calculateShieldFee());
      })();
    }
  }, [totalBalance.confirmedTransparentBalance, anyPending, calculateShieldFee, readOnly]);

  useEffect(() => {
    const _uaddrs: UnifiedAddressClass[] = [...addressesUnified].reverse();
    let _defaultUaddr: string = _uaddrs.length > 0 ? _uaddrs[0].encoded_address : "";
    setUaddrs(_uaddrs);
    setDefaultUaddr(_defaultUaddr);
  }, [addressesUnified]);

  useEffect(() => {
    const _taddrs: TransparentAddressClass[] = [
      ...addressesTransparent.filter((t: TransparentAddressClass) => t.scope === AddressScopeEnum.external),
    ].reverse();
    let _defaultTaddr: string = _taddrs.length > 0 ? _taddrs[0].encoded_address : "";
    setTaddrs(_taddrs);
    setDefaultTaddr(_defaultTaddr);
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
      <div className={styles.containermargin} style={{ marginLeft: 20 }}>
        <Tabs>
          <TabList>
            {(orchardPool || saplingPool) && <Tab>Unified</Tab>}
            {transparentPool && <Tab>Transparent</Tab>}
          </TabList>

          <TabPanel>
            {(orchardPool || saplingPool) && !!uaddrs && uaddrs.length > 0 && (
              <ScrollPaneTop offsetHeight={180}>
                <Accordion preExpanded={[defaultUaddr]}>
                  {uaddrs.map((a: UnifiedAddressClass) => (
                    <AddressBlock
                      key={`u-${a.encoded_address}`}
                      address={a}
                      currencyName={info.currencyName}
                      label={addressBookMap.get(a.encoded_address)}
                      type={"u"}
                    />
                  ))}
                </Accordion>
              </ScrollPaneTop>
            )}
          </TabPanel>

          <TabPanel>
            {transparentPool && !!taddrs && taddrs.length > 0 && (
              <ScrollPaneTop offsetHeight={180}>
                <Accordion preExpanded={[defaultTaddr]}>
                  {taddrs.map((a: TransparentAddressClass) => (
                    <AddressBlock
                      key={`t-${a.encoded_address}`}
                      address={a}
                      currencyName={info.currencyName}
                      label={addressBookMap.get(a.encoded_address)}
                      type={"t"}
                      calculateShieldFee={calculateShieldFee}
                      handleShieldButton={handleShieldButton}
                    />
                  ))}
                </Accordion>
              </ScrollPaneTop>
            )}
          </TabPanel>
        </Tabs>
      </div>
    </div>
  );
};

export default Receive;
