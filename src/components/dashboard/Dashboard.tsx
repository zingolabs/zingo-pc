import React, { useContext, useEffect, useState } from "react";
import {
  Accordion,
} from "react-accessible-accordion";
import styles from "./Dashboard.module.css";
import cstyles from "../common/Common.module.css";
import Utils from "../../utils/utils";
import ScrollPaneTop from "../scrollPane/ScrollPane";
import { BalanceBlockHighlight, BalanceBlock } from "../balanceblock";
import AddressBalanceItem from "./components/AddressBalanceItem"; 
import { ContextApp } from "../../context/ContextAppState";

import native from "../../native.node";
import { AddressTransparentClass, AddressUnifiedClass } from "../appstate";

type DashboardProps = {
  calculateShieldFee: () => Promise<number>;
  handleShieldButton: () => void;
};

const Dashboard: React.FC<DashboardProps> = ({calculateShieldFee, handleShieldButton}) => {
  const context = useContext(ContextApp);
  const { totalBalance, info, readOnly, fetchError, addressesUnified, addressesTransparent } = context;

  const [anyPending, setAnyPending] = useState<boolean>(false);
  const [shieldFee, setShieldFee] = useState<number>(0);
  const [transparent, setTransparent] = useState<boolean>(true);
  const [sapling, setSapling] = useState<boolean>(true);
  const [orchard, setOrchard] = useState<boolean>(true);

  //useEffect(() => {
  //  const _anyPending: Address | undefined = !!addresses && addresses.find((i: Address) => i.containsPending === true);
  //  setAnyPending(!!_anyPending);
  //}, [addresses]);
    
  useEffect(() => {
    // with transparent funds & no readonly wallet
    if (totalBalance.transparent > 0 && calculateShieldFee && !readOnly) {
      (async () => {
        setShieldFee(await calculateShieldFee());
      })();
    }
  }, [totalBalance.transparent, anyPending, calculateShieldFee, readOnly]); 

  useEffect(() => {
    (async () => {
      const walletKindStr: string = await native.wallet_kind();
      const walletKindJSON = JSON.parse(walletKindStr);

      if (!walletKindJSON.transparent) {
        setTransparent(false);
      }
      if (!walletKindJSON.sapling) {
        setSapling(false);
      }
      if (!walletKindJSON.orchard) {
        setOrchard(false);
      }
    })();
  }, []);

  console.log('shield fee', shieldFee);

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
          {orchard && (
            <BalanceBlock
              topLabel="Orchard"
              zecValue={totalBalance.obalance}
              usdValue={Utils.getZecToUsdString(info.zecPrice, totalBalance.obalance)}
              currencyName={info.currencyName}
            />
          )}
          {sapling && (
            <BalanceBlock
              topLabel="Sapling"
              zecValue={totalBalance.zbalance}
              usdValue={Utils.getZecToUsdString(info.zecPrice, totalBalance.zbalance)}
              currencyName={info.currencyName}
            />
          )}
          {transparent && (
            <BalanceBlock
              topLabel="Transparent"
              zecValue={totalBalance.transparent}
              usdValue={Utils.getZecToUsdString(info.zecPrice, totalBalance.transparent)}
              currencyName={info.currencyName}
            />
          )}
        </div>
        <div className={cstyles.balancebox}>
          {totalBalance.transparent >= shieldFee && shieldFee > 0 && !readOnly && !anyPending &&  (
            <>
              <button className={[cstyles.primarybutton].join(" ")} type="button" onClick={handleShieldButton}>
                Shield Transparent Balance To Orchard (Fee: {shieldFee})
              </button>
            </>
          )}
          {!!anyPending && (
            <div className={[cstyles.red, cstyles.small, cstyles.padtopsmall].join(" ")}>
              Some transactions are pending. Balances may change.
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

      <div className={[cstyles.flexspacebetween, cstyles.xlarge, cstyles.marginnegativetitle].join(" ")}>
        <div style={{ marginLeft: 100 }}>Address</div>
        <div style={{ marginRight: 40 }}>Balance</div>
      </div>

      <div className={styles.addressbalancecontainer}>
        <ScrollPaneTop offsetHeight={190}>
          <div className={styles.addressbooklist}>
            {(!addressesUnified || addressesUnified.length === 0) && 
             (!addressesTransparent || addressesTransparent.length === 0) ? (
              <div className={[cstyles.center, cstyles.sublight, cstyles.margintoplarge].join(" ")}>No Addresses with a balance</div>
            ) : (
              <>
                <Accordion>
                  {addressesUnified
                    .filter((ab: AddressUnifiedClass) => ab.balance > 0)
                    .map((ab: AddressUnifiedClass) => (
                      <AddressBalanceItem
                        key={ab.address}
                        item={ab}
                        currencyName={info.currencyName}
                        zecPrice={info.zecPrice}
                      />
                    ))}
                </Accordion>
                <Accordion>
                  {addressesTransparent
                    .filter((ab: AddressTransparentClass) => ab.balance > 0)
                    .map((ab: AddressTransparentClass) => (
                      <AddressBalanceItem
                        key={ab.address}
                        item={ab}
                        currencyName={info.currencyName}
                        zecPrice={info.zecPrice}
                      />
                    ))}
                </Accordion>
              </>
            )}
          </div>
        </ScrollPaneTop>
      </div>
    </div>
  );
};

export default Dashboard;