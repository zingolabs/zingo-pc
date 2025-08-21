import React, { useContext, useEffect, useState } from "react";
import styles from "./Dashboard.module.css";
import cstyles from "../common/Common.module.css";
import Utils from "../../utils/utils";
import { BalanceBlockHighlight, BalanceBlock } from "../balanceblock";
import { ContextApp } from "../../context/ContextAppState";

import native from "../../native.node";
import { ValueTransferClass } from "../appstate";

type DashboardProps = {
  calculateShieldFee: () => Promise<number>;
  handleShieldButton: () => void;
};

const Dashboard: React.FC<DashboardProps> = ({calculateShieldFee, handleShieldButton}) => {
  const context = useContext(ContextApp);
  const { totalBalance, info, readOnly, fetchError, valueTransfers } = context;

  const [anyPending, setAnyPending] = useState<boolean>(false);
  const [shieldFee, setShieldFee] = useState<number>(0);
  const [transparent, setTransparent] = useState<boolean>(true);
  const [sapling, setSapling] = useState<boolean>(true);
  const [orchard, setOrchard] = useState<boolean>(true);

  useEffect(() => {
    // set somePending as well here when I know there is something new in ValueTransfers
    const pending: number =
      valueTransfers.length > 0 ? valueTransfers.filter((vt: ValueTransferClass) => vt.confirmations >= 0 && vt.confirmations < 3).length : 0;
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
            zecValue={totalBalance.totalOrchardBalance + totalBalance.totalSaplingBalance + totalBalance.totalTransparentBalance}
            usdValue={Utils.getZecToUsdString(info.zecPrice, totalBalance.totalOrchardBalance + totalBalance.totalSaplingBalance + totalBalance.totalTransparentBalance)}
            currencyName={info.currencyName}
            zecValueConfirmed={totalBalance.confirmedOrchardBalance + totalBalance.confirmedSaplingBalance + totalBalance.confirmedTransparentBalance}
            usdValueConfirmed={Utils.getZecToUsdString(info.zecPrice, totalBalance.confirmedOrchardBalance + totalBalance.confirmedSaplingBalance + totalBalance.confirmedTransparentBalance)}            
          />
          {orchard && (
            <BalanceBlock
              topLabel="Orchard"
              zecValue={totalBalance.totalOrchardBalance}
              usdValue={Utils.getZecToUsdString(info.zecPrice, totalBalance.totalOrchardBalance)}
              currencyName={info.currencyName}
              zecValueConfirmed={totalBalance.confirmedOrchardBalance}
              usdValueConfirmed={Utils.getZecToUsdString(info.zecPrice, totalBalance.confirmedOrchardBalance)}
            />
          )}
          {sapling && (
            <BalanceBlock
              topLabel="Sapling"
              zecValue={totalBalance.totalSaplingBalance}
              usdValue={Utils.getZecToUsdString(info.zecPrice, totalBalance.totalSaplingBalance)}
              currencyName={info.currencyName}
              zecValueConfirmed={totalBalance.confirmedSaplingBalance}
              usdValueConfirmed={Utils.getZecToUsdString(info.zecPrice, totalBalance.confirmedSaplingBalance)}
            />
          )}
          {transparent && (
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

        

    </div>
  );
};

export default Dashboard;