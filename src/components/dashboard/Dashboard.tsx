import React, { useContext, useEffect, useState } from "react";
import styles from "./Dashboard.module.css";
import cstyles from "../common/Common.module.css";
import Utils from "../../utils/utils";
import { BalanceBlockHighlight, BalanceBlock } from "../balanceblock";
import { ContextApp } from "../../context/ContextAppState";

import native from "../../native.node";
import { ServerChainNameEnum, ValueTransferClass } from "../appstate";
import ScrollPaneTop from "../scrollPane/ScrollPane";
import DetailLine from "../zcashd/components/DetailLine";
const { ipcRenderer } = window.require("electron");

type DashboardProps = {
  calculateShieldFee: () => Promise<number>;
  handleShieldButton: () => void;
};

const chains = {
  "main": "Mainnet",
  "test": "Testnet",
  "regtest": "Regtest",
  "": "" 
}; 

const Dashboard: React.FC<DashboardProps> = ({calculateShieldFee, handleShieldButton}) => {
  const context = useContext(ContextApp);
  const { totalBalance, info, readOnly, fetchError, valueTransfers } = context;

  const [anyPending, setAnyPending] = useState<boolean>(false);
  const [shieldFee, setShieldFee] = useState<number>(0);
  const [transparent, setTransparent] = useState<boolean>(true);
  const [sapling, setSapling] = useState<boolean>(true);
  const [orchard, setOrchard] = useState<boolean>(true);
  const [url, setUrl] = useState<string>("");
  const [chain_name, setChain_name] = useState<ServerChainNameEnum | "">("");

  useEffect(() => {
    ( async () => {
      const settings = await ipcRenderer.invoke("loadSettings");
      setUrl(settings?.serveruri || ''); 
      setChain_name(settings?.serverchain_name || '');
    })();
  }, []);

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

      <div className={[styles.horizontalcontainer].join(" ")}>
        <div className={cstyles.containermarginleft}>
          <ScrollPaneTop offsetHeight={260}>
            <div className={cstyles.horizontalflex} style={{ justifyContent: 'space-between', padding: 20 }}>

              <div style={{ width: '50%', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                Last transactions
                <div>
                  <div className={styles.detailcontainer}>
                    <div className={styles.detaillines}>
                      <DetailLine label={Utils.VTTypeWithConfirmations(valueTransfers[0].type, valueTransfers[0].confirmations)} value={'ZEC ' + Utils.maxPrecisionTrimmed(valueTransfers[0].amount)} />
                      <DetailLine label={Utils.VTTypeWithConfirmations(valueTransfers[1].type, valueTransfers[1].confirmations)} value={'ZEC ' + Utils.maxPrecisionTrimmed(valueTransfers[1].amount)} />
                      <DetailLine label={Utils.VTTypeWithConfirmations(valueTransfers[2].type, valueTransfers[2].confirmations)} value={'ZEC ' + Utils.maxPrecisionTrimmed(valueTransfers[2].amount)} />
                      <DetailLine label={Utils.VTTypeWithConfirmations(valueTransfers[3].type, valueTransfers[3].confirmations)} value={'ZEC ' + Utils.maxPrecisionTrimmed(valueTransfers[3].amount)} />
                      <DetailLine label={Utils.VTTypeWithConfirmations(valueTransfers[4].type, valueTransfers[4].confirmations)} value={'ZEC ' + Utils.maxPrecisionTrimmed(valueTransfers[4].amount)} />
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ width: '50%', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                Server info
                <div>
                  <div className={styles.detailcontainer}>
                    <div className={styles.detaillines}>
                      <DetailLine label="Server URI" value={url} />
                      <DetailLine label="Chain Name" value={chain_name ? chains[chain_name] : ''} />
                      <DetailLine label="Server Network" value={chains[info.chainName]} />
                      <DetailLine label="Block Height" value={`${info.latestBlock}`} />
                      <DetailLine label="ZEC Price" value={`USD ${info.zecPrice.toFixed(2)}`} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </ScrollPaneTop>
        </div>
      </div>

    </div>
  );
};

export default Dashboard;