import React, { useContext, useEffect, useState } from "react";
import styles from "./Dashboard.module.css";
import cstyles from "../common/Common.module.css";
import Utils from "../../utils/utils";
import { BalanceBlockHighlight, BalanceBlock } from "../balanceBlock";
import { ContextApp } from "../../context/ContextAppState";
import routes from "../../constants/routes.json";
import { ironwoodReady } from "../../constants/ironwood";

import {
  SyncStatusScanRangePriorityEnum,
  SyncStatusScanRangeType,
  TotalBalanceClass,
  ValueTransferClass,
  ValueTransferStatusEnum,
} from "../appstate";
import ScrollPaneTop from "../scrollPane/ScrollPane";
import DetailLine from "../detailLine/DetailLine";
import { useNavigate } from "react-router-dom";

type DashboardProps = {
  navigateToHistory: () => void;
};

const Dashboard: React.FC<DashboardProps> = ({ navigateToHistory }) => {
  const navigate = useNavigate();
  const context = useContext(ContextApp);
  const {
    totalBalance,
    info,
    readOnly,
    fetchError,
    valueTransfers,
    syncingStatus,
    currentWallet,
    currentWalletOpenError,
    birthday,
    orchardPool,
    saplingPool,
    transparentPool,
    calculateShieldFee,
    handleShieldButton,
    zecPrice,
  } = context;

  // Ironwood / NU6.3 heads-up. The activation height comes from zingolib
  // (info.nu63ActivationHeight); 0 means unknown/not scheduled → banner hidden.
  // Countdown is measured against the wallet's own synced height, so it reaches
  // zero exactly when the wallet is ready.
  const nu63Activation: number = info.nu63ActivationHeight;
  const ironwoodIsReady: boolean = ironwoodReady(nu63Activation, info.walletHeight);

  const [anyPending, setAnyPending] = useState<boolean>(false);
  const [shieldFee, setShieldFee] = useState<number>(0);

  useEffect(() => {
    // set somePending as well here when I know there is something new in ValueTransfers
    // avoid failed txs because always they have 0 confirmations.
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

  return (
    <div>
      {currentWallet !== null &&
        !currentWalletOpenError &&
        !readOnly &&
        !!totalBalance &&
        totalBalance.confirmedOrchardBalance > 0 &&
        nu63Activation > 0 && (
          <div className={`${cstyles.well} ${styles.migratebanner}`}>
            <div className={styles.migratebannertext}>
              <span className={cstyles.yellow} style={{ marginRight: 10 }}>
                &#9888;
              </span>
              {ironwoodIsReady ? (
                <>
                  After NU6.3 you can no longer move funds inside Orchard.{" "}
                  <b>
                    {info.currencyName} {Utils.maxPrecisionTrimmed(totalBalance.confirmedOrchardBalance)}
                  </b>{" "}
                  can be migrated to Ironwood.
                </>
              ) : (
                <>
                  Ironwood (NU6.3) activates at block <b>{nu63Activation.toLocaleString()}</b> &mdash;{" "}
                  <b>{(nu63Activation - info.walletHeight).toLocaleString()}</b> blocks to go. After that, your{" "}
                  <b>
                    {info.currencyName} {Utils.maxPrecisionTrimmed(totalBalance.confirmedOrchardBalance)}
                  </b>{" "}
                  in Orchard will need to move to Ironwood.
                </>
              )}
            </div>
            {ironwoodIsReady && (
              <button
                type="button"
                className={cstyles.primarybutton}
                onClick={() => navigate(routes.MIGRATION, { replace: true, state: {} })}
              >
                Migrate
              </button>
            )}
          </div>
        )}
      {currentWallet !== null && !currentWalletOpenError && (
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
      )}
      <div className={styles.horizontalcontainer}>
        {currentWallet !== null && !currentWalletOpenError && birthday >= 0 && !!syncingStatus.scan_ranges && (
          <div style={{ justifyContent: "center", alignItems: "center", textAlign: "center" }}>
            Nonlinear Scanning Map
          </div>
        )}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "flex-start",
            width: "100%",
            borderBottomColor: "green",
            borderBottomWidth: 0,
            marginBottom: 0,
            marginTop: 10,
          }}
        >
          {currentWallet !== null &&
            !currentWalletOpenError &&
            birthday >= 0 &&
            !!syncingStatus.scan_ranges &&
            syncingStatus.scan_ranges.map((range: SyncStatusScanRangeType) => {
              const percent: number = ((range.end_block - range.start_block) * 100) / (info.latestBlock - birthday);
              return (
                <div
                  key={`${range.start_block.toString() + "-" + range.end_block.toString()}`}
                  style={{
                    height: 25,
                    width: `${percent}%`,
                    backgroundColor:
                      range.priority === SyncStatusScanRangePriorityEnum.Scanning
                        ? "orange" /* Scanning */
                        : range.priority === SyncStatusScanRangePriorityEnum.RefetchingNullifiers
                          ? "darkorange" /* Refetching spends  */
                          : range.priority === SyncStatusScanRangePriorityEnum.Scanned
                            ? "green" /* Scanned  */
                            : range.priority === SyncStatusScanRangePriorityEnum.ScannedWithoutMapping
                              ? "green" /* Scanned  */
                              : range.priority === SyncStatusScanRangePriorityEnum.Historic
                                ? "gray" /* Low priority */
                                : range.priority === SyncStatusScanRangePriorityEnum.OpenAdjacent
                                  ? "blue" /* High priority */
                                  : range.priority === SyncStatusScanRangePriorityEnum.FoundNote
                                    ? "blue" /* High priority */
                                    : range.priority === SyncStatusScanRangePriorityEnum.ChainTip
                                      ? "blue" /* High priority */
                                      : range.priority === SyncStatusScanRangePriorityEnum.Verify
                                        ? "blue" /* High priority */
                                        : "red" /* error somehow */,
                  }}
                />
              );
            })}
        </div>
        {currentWallet !== null && !currentWalletOpenError && birthday >= 0 && !!syncingStatus.scan_ranges && (
          <div
            style={{
              display: "flex",
              width: "100%",
              justifyContent: "flex-start",
              alignItems: "flex-start",
              marginTop: 5,
              marginLeft: 10,
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                flexWrap: "nowrap",
                marginRight: 10,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  width: 10,
                  height: 10,
                  justifyContent: "flex-start",
                  backgroundColor: "green",
                  margin: 5,
                }}
              />
              Scanned
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                flexWrap: "nowrap",
                marginRight: 10,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  width: 10,
                  height: 10,
                  justifyContent: "flex-start",
                  backgroundColor: "orange",
                  margin: 5,
                }}
              />
              Scanning...
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                flexWrap: "nowrap",
                marginRight: 10,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  width: 10,
                  height: 10,
                  justifyContent: "flex-start",
                  backgroundColor: "darkorange",
                  margin: 5,
                }}
              />
              Refetching spends...
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                flexWrap: "nowrap",
                marginRight: 10,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  width: 10,
                  height: 10,
                  justifyContent: "flex-start",
                  backgroundColor: "gray",
                  margin: 5,
                }}
              />
              Low Priority
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                flexWrap: "nowrap",
                marginRight: 10,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  width: 10,
                  height: 10,
                  justifyContent: "flex-start",
                  backgroundColor: "blue",
                  margin: 5,
                }}
              />
              High Priority
            </div>
          </div>
        )}
      </div>

      <div className={styles.detailcontainer}>
        <div className={cstyles.containermargin}>
          <ScrollPaneTop offsetHeight={260}>
            <div className={cstyles.horizontalflex} style={{ justifyContent: "space-between", padding: 20 }}>
              {currentWallet !== null && !currentWalletOpenError && (
                <div style={{ width: "48%", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
                  Last transactions
                  <div>
                    <div className={styles.detailcontainer}>
                      {!!valueTransfers && !!valueTransfers.length ? (
                        <>
                          <div
                            className={`${styles.detaillines} ${styles.txgrid} ${
                              info.currencyName === "ZEC" ? styles.txgridUsd : styles.txgridNoUsd
                            }`}
                          >
                            {valueTransfers
                              .filter((_, index: number) => index < 5)
                              .map((vt: ValueTransferClass, index: number) => {
                                // Same fallback chain used everywhere else: prefer the
                                // per-tx price snapshot, fall back to current zecPrice
                                // so the USD column doesn't read "USD --" while the
                                // server-info panel right next to it shows a price.
                                const price: number = vt.zec_price || zecPrice || 0;
                                const failed: boolean = vt.status === ValueTransferStatusEnum.failed;
                                const failedColor: string | undefined = failed
                                  ? Utils.getCssVariable("--color-error")
                                  : undefined;
                                // Three grid columns (see .txgrid): transfer type on the
                                // left, ZEC amount left-aligned, smaller USD right-aligned.
                                return (
                                  <React.Fragment key={index}>
                                    <div className={`${cstyles.sublight} ${styles.txtype}`}>
                                      {Utils.VTTypeWithConfirmations(vt.type, vt.status, vt.confirmations)} :
                                    </div>
                                    <div className={styles.txzec} style={{ color: failedColor }}>
                                      {info.currencyName} {Utils.maxPrecisionTrimmed(vt.amount)}
                                    </div>
                                    {info.currencyName === "ZEC" && (
                                      <div
                                        className={styles.txusd}
                                        style={{ color: failedColor ?? Utils.getCssVariable("--color-primary") }}
                                      >
                                        {Utils.getZecToUsdString(price, vt.amount)}
                                      </div>
                                    )}
                                  </React.Fragment>
                                );
                              })}
                          </div>
                          <button
                            type="button"
                            style={{
                              width: "100%",
                              textAlign: "right",
                              color: Utils.getCssVariable("--color-primary"),
                              marginTop: 20,
                              cursor: "pointer",
                              background: "none",
                              border: "none",
                              padding: 0,
                              font: "inherit",
                            }}
                            onClick={() => navigateToHistory()}
                          >
                            See more...
                          </button>
                        </>
                      ) : (
                        <div className={styles.detaillines}>No Transactions Yet</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {currentWallet !== null &&
                !currentWalletOpenError &&
                !!info &&
                !!info.serverUri &&
                !!info.chainName &&
                !!info.latestBlock && (
                  <div style={{ width: "48%", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
                    Server info
                    <div>
                      <div className={styles.detailcontainer}>
                        <div className={styles.detaillines}>
                          <DetailLine label="Server URI" value={info ? info.serverUri : ""} />
                          <DetailLine label="Server Network" value={Utils.chainDisplayName(info.chainName)} />
                          <DetailLine label="Server Version" value={info.version} />
                          <DetailLine label="Zingolib Version" value={info.zingolib} />
                          <DetailLine label="Block Height" value={`${info.latestBlock}`} />
                          {info.currencyName === "ZEC" && (
                            <DetailLine label="ZEC Price" value={`USD ${zecPrice.toFixed(2)}`} />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

              {currentWallet === null && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    width: "100%",
                    justifyContent: "center",
                    alignItems: "center",
                    marginTop: 100,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      width: "80%",
                      justifyContent: "center",
                      alignItems: "center",
                      marginTop: 50,
                      marginBottom: 20,
                    }}
                  >
                    There is no wallets added.
                  </div>
                  <button
                    type="button"
                    className={cstyles.primarybutton}
                    onClick={() => {
                      navigate(routes.ADDNEWWALLET, { state: { mode: "addnew" } });
                    }}
                  >
                    Add New Wallet
                  </button>
                </div>
              )}

              {!!currentWalletOpenError && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    width: "100%",
                    justifyContent: "center",
                    alignItems: "center",
                    marginTop: 100,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      width: "80%",
                      justifyContent: "center",
                      alignItems: "center",
                      marginTop: 50,
                      marginBottom: 20,
                    }}
                  >
                    {`Error Opening the current Wallet: ${currentWalletOpenError}`}
                  </div>
                  <div className={cstyles.verticalbuttons}>
                    <button
                      type="button"
                      className={cstyles.primarybutton}
                      onClick={() => {
                        navigate(routes.ADDNEWWALLET, { state: { mode: "settings" } });
                      }}
                    >
                      Wallet Settings
                    </button>
                    <button
                      type="button"
                      className={cstyles.primarybutton}
                      onClick={() => {
                        navigate(routes.ADDNEWWALLET, { state: { mode: "delete" } });
                      }}
                    >
                      Delete Wallet
                    </button>
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
