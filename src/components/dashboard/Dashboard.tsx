import React, { useContext, useEffect, useState } from "react";
import styles from "./Dashboard.module.css";
import cstyles from "../common/Common.module.css";
import Utils from "../../utils/utils";
import { BalanceBlockHighlight, BalanceBlock } from "../balanceBlock";
import { ContextApp } from "../../context/ContextAppState";
import routes from "../../constants/routes.json";
import { ironwoodReady } from "../../constants/ironwood";
import RPC from "../../rpc/rpc";

import {
  SyncStatusScanRangePriorityEnum,
  SyncStatusScanRangeType,
  TotalBalanceClass,
  ValueTransferClass,
  ValueTransferKindEnum,
  ValueTransferStatusEnum,
} from "../appstate";
import ScrollPaneTop from "../scrollPane/ScrollPane";
import { usePaneOffset } from "../scrollPane/usePaneOffset";
import { useValueTransfersWithSwaps } from "../../context/ContextSwapService";
import { swapRowLabel } from "../../swap";
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
    reopenWallet,
  } = context;

  // Ironwood / NU6.3 heads-up. The activation height comes from zingolib
  // (info.nu63ActivationHeight); 0 means unknown/not scheduled → banner hidden.
  // Countdown is measured against the wallet's own synced height, so it reaches
  // zero exactly when the wallet is ready.
  const nu63Activation: number = info.nu63ActivationHeight;
  const ironwoodIsReady: boolean = ironwoodReady(nu63Activation, info.walletHeight);
  // The Orchard balance is all dust when the drain plan can migrate nothing yet
  // has stranded value — from the start or as a residue. Both figures come from
  // the same plan_orchard_drain call, so they never disagree the way the balance
  // and the plan can while a wallet is still syncing (which caused a flashing
  // icon). -1 migratable = "not checked yet" → not dust.
  const orchardIsDust: boolean = info.orchardMigratable === 0 && info.orchardDust > 0;

  // Percentage of scheduled batches already sent — drives the banner's ring.
  const migrationPct: number = info.migrationBatchesTotal
    ? Math.round((info.migrationBatchesConfirmed / info.migrationBatchesTotal) * 100)
    : 0;

  const { paneRef, paneOffset } = usePaneOffset(260);

  const [anyPending, setAnyPending] = useState<boolean>(false);
  const [shieldFee, setShieldFee] = useState<number>(0);
  // Optimistically hide the "complete" banner the instant Dismiss is clicked;
  // cancelIronwoodMigration clears the persisted state so the next info refresh
  // keeps it hidden too (a completed migration lingers as phase "complete" until
  // dismissed, funds already in Ironwood — clearing is non-destructive).
  const [migrationDismissed, setMigrationDismissed] = useState<boolean>(false);
  const dismissMigration = async (): Promise<void> => {
    setMigrationDismissed(true);
    await RPC.cancelIronwoodMigration();
  };

  // The immediate (happy-path) migration runs in the native while the sync loop
  // is stopped, so fetchInfo is frozen and the banner below would otherwise read
  // as idle. drain_status is a lock-free side channel that stays live during the
  // drain — poll it so the Dashboard shows the migration is underway even when
  // the user navigates away from the migration screen.
  const [drainProgress, setDrainProgress] = useState<{
    built: number;
    sent: number;
    total: number;
    phase: string;
  } | null>(null);
  useEffect(() => {
    let active = true;
    const id = setInterval(async () => {
      const s = await RPC.drainStatus();
      if (active) setDrainProgress(s);
    }, 1500);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);
  const drainRunning = drainProgress !== null;

  // Swaps belong in "Last transactions" for the same reason they belong in
  // History: they moved the user's money. A summary that skipped them could
  // show five older transfers while the swap that just left the wallet sat
  // above all of them on the History page.
  const recentTransfers = useValueTransfersWithSwaps(valueTransfers);

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
      {/* Immediate (happy-path) migration underway in the native. Shown from the
          lock-free drain_status so it stays visible even after the user leaves the
          migration screen — the funds are being proved/broadcast right now. */}
      {currentWallet !== null && !currentWalletOpenError && drainRunning && (
        <div className={`${cstyles.well} ${styles.migrationprogress}`}>
          <div className={styles.migrationtop}>
            <span className={cstyles.highlight}>Migration in progress</span>
            <button
              type="button"
              className={styles.detailslink}
              onClick={() => navigate(routes.MIGRATION, { replace: true, state: {} })}
            >
              Details
            </button>
          </div>
          <div className={cstyles.sublight} style={{ marginTop: 6 }}>
            {drainProgress && drainProgress.total > 0
              ? drainProgress.phase === "building"
                ? `Proving and signing your transactions… ${drainProgress.built}/${drainProgress.total}`
                : `Broadcasting to Ironwood… ${drainProgress.sent}/${drainProgress.total}`
              : "Proving and broadcasting your transactions to Ironwood."}{" "}
            Keep the app open.
          </div>
        </div>
      )}
      {/* Gate the whole banner on info-only, self-consistent signals: nu63Activation
          and orchardMigratable both come from the same fetchInfo commit, so they never
          disagree the way get_balance and the drain plan can while a wallet loads/syncs
          (which made the banner flash on wallet switch). orchardMigratable > 0 is the
          definitive "there's migratable Orchard and it's not dust" signal (-1 = not
          checked yet, 0 = all dust → no banner). */}
      {/* Private (scheduled) migration underway: a self-driven flow the user
          resumes to send each due batch. TODO(ffi): info.migrationInProgress and
          its figures come from zingolib migration_status() once wired; until then
          this banner stays hidden (migrationInProgress defaults false). */}
      {/* Migration finished: every batch is in Ironwood. The state lingers as
          phase "complete" until dismissed, so show a distinct "complete" banner
          (not the progress ring) with Dismiss, which clears it for good. */}
      {currentWallet !== null &&
        !currentWalletOpenError &&
        info.migrationInProgress &&
        info.migrationComplete &&
        !migrationDismissed && (
          <div className={`${cstyles.well} ${styles.migrationprogress}`}>
            <div className={styles.migrationtop}>
              <span className={`${cstyles.highlight} ${cstyles.green}`}>Migration complete</span>
              <button
                type="button"
                className={styles.detailslink}
                onClick={() => navigate(routes.MIGRATION, { replace: true, state: { resume: true } })}
              >
                Details
              </button>
            </div>
            <div className={styles.migrationprogressbody}>
              <span className={cstyles.sublight}>
                All your funds are now in the Ironwood pool — nothing left to do.
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
              <button type="button" className={cstyles.primarybutton} onClick={dismissMigration}>
                Dismiss
              </button>
            </div>
          </div>
        )}
      {currentWallet !== null && !currentWalletOpenError && info.migrationInProgress && !info.migrationComplete && (
        <div className={`${cstyles.well} ${styles.migrationprogress}`}>
          <div className={styles.migrationtop}>
            <span className={cstyles.highlight}>Migration in progress</span>
            <button
              type="button"
              className={styles.detailslink}
              onClick={() => navigate(routes.MIGRATION, { replace: true, state: { resume: true } })}
            >
              Details
            </button>
          </div>
          <div className={styles.migrationprogressbody}>
            <div
              className={styles.migrationring}
              style={{
                background: `conic-gradient(var(--color-primary) ${migrationPct * 3.6}deg, var(--color-background-dark) 0deg)`,
              }}
            >
              <span className={styles.migrationringinner}>{migrationPct}%</span>
            </div>
            <div className={styles.migrationinfo}>
              <span className={cstyles.sublight}>
                {info.migrationBatchesConfirmed} of {info.migrationBatchesTotal} batches sent
              </span>
              <div className={styles.migrationnextrow}>
                <span className={cstyles.yellow}>
                  {info.migrationNextBlocks > 0
                    ? `Next batch opens in ~${info.migrationNextBlocks} blocks`
                    : "Sending automatically — keep the app open"}
                </span>
                <span className={cstyles.sublight}>
                  {info.currencyName} {Utils.maxPrecisionTrimmed(info.migrationPendingZec)} pending
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
      {currentWallet !== null &&
        !currentWalletOpenError &&
        !readOnly &&
        !info.migrationInProgress &&
        !drainRunning &&
        nu63Activation > 0 &&
        info.orchardMigratable > 0 && (
          <div className={`${cstyles.well} ${styles.migratebanner}`}>
            <div className={styles.migratebannertext}>
              <span className={cstyles.yellow} style={{ marginRight: 10 }}>
                &#9888;
              </span>
              {ironwoodIsReady ? (
                <>
                  After NU6.3 you can no longer move funds inside Orchard.{" "}
                  <b>
                    {info.currencyName} {Utils.maxPrecisionTrimmed(info.orchardMigratable)}
                  </b>{" "}
                  can be migrated to Ironwood.
                </>
              ) : (
                <>
                  Ironwood (NU6.3) activates at block <b>{nu63Activation.toLocaleString()}</b> &mdash;{" "}
                  <b>{(nu63Activation - info.walletHeight).toLocaleString()}</b> blocks to go. After that, your{" "}
                  <b>
                    {info.currencyName} {Utils.maxPrecisionTrimmed(info.orchardMigratable)}
                  </b>{" "}
                  in Orchard will need to move to Ironwood.
                </>
              )}
            </div>
            {ironwoodIsReady ? (
              <button
                type="button"
                className={cstyles.primarybutton}
                onClick={() => navigate(routes.MIGRATION, { replace: true, state: {} })}
              >
                Migrate
              </button>
            ) : (
              // Before activation the migration can't run, but the plan can be
              // computed — let the user preview it (a dry run / test).
              <button
                type="button"
                className={cstyles.primarybutton}
                onClick={() => navigate(routes.MIGRATION, { replace: true, state: { simulation: true } })}
              >
                Simulate
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
                tooltip={
                  orchardIsDust
                    ? "Dust: this Orchard balance is below the migration threshold, so it can't move to Ironwood (moving it would cost more than it carries)."
                    : undefined
                }
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
          {/* The balance block above gains a line per pool the wallet holds
              and another for the shield button, so its height belongs to the
              wallet rather than to the screen. */}
          <div ref={paneRef}>
            <ScrollPaneTop offsetHeight={paneOffset}>
              <div className={cstyles.horizontalflex} style={{ justifyContent: "space-between", padding: 20 }}>
                {currentWallet !== null && !currentWalletOpenError && (
                  <div style={{ width: "48%", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
                    Last transactions
                    <div>
                      <div className={styles.detailcontainer}>
                        {!!recentTransfers.length ? (
                          <>
                            <div
                              className={`${styles.detaillines} ${styles.txgrid} ${
                                info.currencyName === "ZEC" ? styles.txgridUsd : styles.txgridNoUsd
                              }`}
                            >
                              {recentTransfers
                                .filter((_, index: number) => index < 5)
                                .map((vt: ValueTransferClass, index: number) => {
                                  // Same fallback chain used everywhere else: prefer the
                                  // per-tx price snapshot, fall back to current zecPrice
                                  // so the USD column doesn't read "USD --" while the
                                  // server-info panel right next to it shows a price.
                                  // The tx's own recorded price, never the current one (a years-old
                                  // amount at today's price is meaningless); missing renders `USD --`.
                                  const price: number = vt.zec_price || 0;
                                  // A swap row carries the counterparty asset, so
                                  // it brings its own unit and its own quote-time
                                  // price. The wallet's currency and the ZEC price
                                  // would label and value it as something it is not.
                                  const isSwapRow: boolean = vt.type === ValueTransferKindEnum.swap;
                                  const amountUnit: string = isSwapRow ? (vt.swapAssetTicker ?? "") : info.currencyName;
                                  const rowPrice: number = isSwapRow ? (vt.swapUsdUnitPrice ?? 0) : price;
                                  const failed: boolean = vt.status === ValueTransferStatusEnum.failed;
                                  const failedColor: string | undefined = failed ? "var(--color-error)" : undefined;
                                  // Three grid columns (see .txgrid): transfer type on the
                                  // left, ZEC amount left-aligned, smaller USD right-aligned.
                                  return (
                                    <React.Fragment key={index}>
                                      <div className={`${cstyles.sublight} ${styles.txtype}`}>
                                        {/* A swap's state is its own; the five-value
                                          transfer status cannot tell one awaiting
                                          its deposit from one the provider is
                                          already working on. Same call the
                                          History row makes. */}
                                        {vt.type === ValueTransferKindEnum.swap
                                          ? swapRowLabel(vt.swapStatus)
                                          : Utils.VTTypeWithConfirmations(vt.type, vt.status, vt.confirmations)}{" "}
                                        :
                                      </div>
                                      <div className={styles.txzec} style={{ color: failedColor }}>
                                        {amountUnit} {Utils.maxPrecisionTrimmed(vt.amount)}
                                      </div>
                                      {info.currencyName === "ZEC" && (
                                        <div
                                          className={styles.txusd}
                                          style={{ color: failedColor ?? "var(--color-primary)" }}
                                        >
                                          {Utils.getZecToUsdString(rowPrice, vt.amount)}
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
                                color: "var(--color-primary)",
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
                              <DetailLine
                                label="ZEC Price"
                                value={zecPrice ? `USD ${zecPrice.toFixed(2)}` : "USD --"}
                              />
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
                      {/* First, and least drastic: plenty of open failures are a
                        server blip or a sync still settling, and simply going
                        round again clears them. */}
                      <button type="button" className={cstyles.primarybutton} onClick={reopenWallet}>
                        Try Again
                      </button>
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
    </div>
  );
};

export default Dashboard;
