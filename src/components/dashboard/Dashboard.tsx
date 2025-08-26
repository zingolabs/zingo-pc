import React, { useContext, useEffect, useState } from "react";
import styles from "./Dashboard.module.css";
import cstyles from "../common/Common.module.css";
import Utils from "../../utils/utils";
import { BalanceBlockHighlight, BalanceBlock } from "../balanceblock";
import { ContextApp } from "../../context/ContextAppState";

import { SyncStatusScanRangePriorityEnum, SyncStatusScanRangeType, ValueTransferClass } from "../appstate";
import ScrollPaneTop from "../scrollPane/ScrollPane";
import DetailLine from "../zcashd/components/DetailLine";

type DashboardProps = {
  calculateShieldFee: () => Promise<number>;
  handleShieldButton: () => void;
  navigateToHistory: () => void;
  navigateToZcashd: () => void;
};

const chains = {
  "main": "Mainnet",
  "test": "Testnet",
  "regtest": "Regtest",
  "": "" 
}; 

const Dashboard: React.FC<DashboardProps> = ({calculateShieldFee, handleShieldButton, navigateToHistory, navigateToZcashd}) => {
  const context = useContext(ContextApp);
  const { totalBalance, info, readOnly, fetchError, valueTransfers, syncingStatus, serverUri, serverChainName, birthday, orchardPool, saplingPool, transparentPool } = context;

  const [anyPending, setAnyPending] = useState<boolean>(false);
  const [shieldFee, setShieldFee] = useState<number>(0);

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

  //console.log('Dashborad', birthday, syncingStatus);

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

      <div className={[styles.horizontalcontainer].join(" ")}>
        {!!birthday && !!syncingStatus.scan_ranges && (
          <div style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
            Nonlinear Scanning Map
          </div>
        )}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'flex-start',
            width: '100%',
            borderBottomColor: 'green',
            borderBottomWidth: 0,
            marginBottom: 0,
            marginTop: 10,
          }}>
          {!!birthday && !!syncingStatus.scan_ranges && syncingStatus.scan_ranges.map((range: SyncStatusScanRangeType) => {
            const percent: number = ((range.end_block - range.start_block) * 100) / (info.latestBlock - birthday);
            return <div
              key={`${range.start_block.toString() + '-' + range.end_block.toString()}`}
              style={{
                height: 25,
                width: `${percent}%`,
                backgroundColor:
                  range.priority === SyncStatusScanRangePriorityEnum.Scanning
                    ? 'orange' /* Scanning */
                    : range.priority === SyncStatusScanRangePriorityEnum.Scanned
                    ? 'green'  /* Scanned  */
                    : range.priority === SyncStatusScanRangePriorityEnum.ScannedWithoutMapping
                    ? 'green'  /* Scanned  */
                    : range.priority === SyncStatusScanRangePriorityEnum.Historic
                    ? 'gray'   /* Low priority */
                    : range.priority === SyncStatusScanRangePriorityEnum.OpenAdjacent
                    ? 'blue'   /* High priority */
                    : range.priority === SyncStatusScanRangePriorityEnum.FoundNote
                    ? 'blue'   /* High priority */
                    : range.priority === SyncStatusScanRangePriorityEnum.ChainTip
                    ? 'blue'   /* High priority */
                    : range.priority === SyncStatusScanRangePriorityEnum.Verify
                    ? 'blue'   /* High priority */
                    : 'red',   /* error somehow */
              }}
            />;
          }
          )}
        </div>
        {!!birthday && !!syncingStatus.scan_ranges && (
          <div
            style={{
              display: 'flex',
              width: '100%',
              justifyContent: 'flex-start',
              alignItems: 'flex-start',
              marginTop: 5,
              marginLeft: 10,
            }}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                flexWrap: 'nowrap',
                marginRight: 10,
                }}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  width: 10,
                  height: 10,
                  justifyContent: 'flex-start',
                  backgroundColor: 'green',
                  margin: 5,
                }}
              />
              Scanned
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                flexWrap: 'nowrap',
                marginRight: 10,
                }}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  width: 10,
                  height: 10,
                  justifyContent: 'flex-start',
                  backgroundColor: 'orange',
                  margin: 5,
                }}
              />
              Scanning...
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                flexWrap: 'nowrap',
                marginRight: 10,
                }}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  width: 10,
                  height: 10,
                  justifyContent: 'flex-start',
                  backgroundColor: 'gray',
                  margin: 5,
                }}
              />
              Low Priority
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                flexWrap: 'nowrap',
                marginRight: 10,
                }}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  width: 10,
                  height: 10,
                  justifyContent: 'flex-start',
                  backgroundColor: 'blue',
                  margin: 5,
                }}
              />
              High Priority
            </div>
          </div>
        )}
      </div>

      <div className={[styles.detailcontainer].join(" ")}>
        <div className={cstyles.containermargin}>
          <ScrollPaneTop offsetHeight={260}>
            <div className={cstyles.horizontalflex} style={{ justifyContent: 'space-between', padding: 20 }}>

              {!!valueTransfers && !!valueTransfers.length && (
                <div style={{ width: '48%', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                  Last transactions
                  <div>
                    <div className={styles.detailcontainer}>
                      <div className={styles.detaillines}>
                        {valueTransfers
                          .filter((_, index: number) => index < 5)
                          .map((vt: ValueTransferClass, index: number) => (
                            <DetailLine key={index} label={Utils.VTTypeWithConfirmations(vt.type, vt.confirmations)} value={'ZEC ' + Utils.maxPrecisionTrimmed(vt.amount)} />
                          ))}
                      </div>
                      <div style={{ width: '100%', textAlign: 'right', color: Utils.getCssVariable('--color-primary'), marginTop: 20, cursor: 'pointer' }} onClick={() => navigateToHistory()}>
                        See more... 
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {!!info && (
                <div style={{ width: '48%', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                  Server info
                  <div>
                    <div className={styles.detailcontainer}>
                      <div className={styles.detaillines}>
                        <DetailLine label="Server URI" value={serverUri} />
                        <DetailLine label="Chain Name" value={serverChainName ? chains[serverChainName] : ''} />
                        <DetailLine label="Server Network" value={chains[info.chainName]} />
                        <DetailLine label="Block Height" value={`${info.latestBlock}`} />
                        <DetailLine label="ZEC Price" value={`USD ${info.zecPrice.toFixed(2)}`} />
                      </div>
                      <div style={{ width: '100%', textAlign: 'right', color: Utils.getCssVariable('--color-primary'), marginTop: 20, cursor: 'pointer' }} onClick={() => navigateToZcashd()}>
                        See more... 
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
            </div>
          </ScrollPaneTop>
        </div>
      </div>

    </div>
  );
};

export default Dashboard;