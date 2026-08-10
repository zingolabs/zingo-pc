import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactModal from "react-modal";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { ErrorModal } from "../components/errorModal";
import cstyles from "../components/common/Common.module.css";
import routes from "../constants/routes.json";
import { Dashboard } from "../components/dashboard";
import { Insight } from "../components/insight";
import { Send, SendManyJsonType } from "../components/send";
import { Receive } from "../components/receive";
import { LoadingScreen } from "../components/loadingScreen";
import {
  AppState,
  TotalBalanceClass,
  ValueTransferClass,
  SendPageStateClass,
  ToAddrClass,
  InfoClass,
  AddressBookEntryClass,
  FetchErrorTypeClass,
  UnifiedAddressClass,
  TransparentAddressClass,
  SyncStatusType,
  ConfirmModalClass,
  ErrorModalClass,
  WalletType,
  ServerClass,
  ServerChainNameEnum,
  BlockExplorerEnum,
} from "../components/appstate";
import RPC from "../rpc/rpc";
import { ZcashURITarget } from "../utils/uris";
import pickRotationTarget from "../utils/pickRotationTarget";
import selectFastestServer from "../utils/selectFastestServer";
import { AddNewWallet } from "../components/addNewWallet";
import { AddressBook, AddressbookImpl } from "../components/addressBook";
import { Sidebar } from "../components/sideBar";
import { History } from "../components/history";
import { ContextAppProvider, defaultAppState } from "../context/ContextAppState";

import { native } from "../electronBridge";
import { Messages } from "../components/messages";
import { OrchardMigration } from "../components/orchardMigration";
import { RPCIronwoodDrainType } from "../rpc/components/RPCIronwoodDrainType";
import { MixnetView, deriveMixnetView } from "../rpc/components/mixnetPresenter";
import { ServerHealthState } from "../rpc/components/serverHealth";
import { RPCMixnetStatusType } from "../rpc/components/RPCMixnetStatusType";
import { ConfirmModal } from "../components/confirmModal";
import ShieldResultContent from "./ShieldResultContent";
import LockScreen from "../components/lockScreen/LockScreen";
import AppSecurityModal from "../components/appSecurity/AppSecurityModal";
import ImportDataModal, { ImportScanResult } from "../components/importData/ImportDataModal";

const { ipcRenderer } = window.electronAPI;

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const AppRoutes: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // --- state ---
  const [totalBalance, setTotalBalanceState] = useState(defaultAppState.totalBalance);
  const [addressesUnified, setAddressesUnifiedState] = useState(defaultAppState.addressesUnified);
  const [addressesTransparent, setAddressesTransparentState] = useState(defaultAppState.addressesTransparent);
  const [addressBook, setAddressBookState] = useState(defaultAppState.addressBook);
  const [valueTransfers, setValueTransfersState] = useState(defaultAppState.valueTransfers);
  const [messages, setMessagesState] = useState(defaultAppState.messages);
  const [sendPageState, setSendPageStateState] = useState(defaultAppState.sendPageState);
  const [info, setInfoState] = useState(defaultAppState.info);
  const [syncingStatus, setSyncingStatusState] = useState(defaultAppState.syncingStatus);
  const [verificationProgress, setVerificationProgressState] = useState(defaultAppState.verificationProgress);
  const [readOnly, setReadOnlyState] = useState(defaultAppState.readOnly);
  const [fetchError, setFetchErrorState] = useState(defaultAppState.fetchError);
  const [currentWallet, setCurrentWalletState] = useState(defaultAppState.currentWallet);
  const [currentWalletOpenError, setCurrentWalletOpenErrorState] = useState(defaultAppState.currentWalletOpenError);
  const [wallets, setWalletsState] = useState(defaultAppState.wallets);
  const [birthday, setBirthdayState] = useState(defaultAppState.birthday);
  const [orchardPool, setOrchardPoolState] = useState(defaultAppState.orchardPool);
  const [saplingPool, setSaplingPoolState] = useState(defaultAppState.saplingPool);
  const [transparentPool, setTransparentPoolState] = useState(defaultAppState.transparentPool);
  const [addLabelState, setAddLabelStateState] = useState(defaultAppState.addLabelState);
  const [errorModal, setErrorModalState] = useState(defaultAppState.errorModal);
  const [confirmModal, setConfirmModalState] = useState(defaultAppState.confirmModal);
  const [locked, setLocked] = useState(false);
  const [lockChecked, setLockChecked] = useState(false);
  const [securityModalOpen, setSecurityModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importScanResult, setImportScanResult] = useState<ImportScanResult | null>(null);
  // Servers the user rotated away from this session. Kept here, not persisted:
  // rotating reopens the wallet but leaves this component mounted, so the memory
  // outlives the reopen and dies with the app.
  const [avoidedServers, setAvoidedServers] = useState<string[]>([]);

  // --- timers ---
  const fetchErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- setters (stable, with deepEqual guards) ---
  const setTotalBalance = useCallback((val: TotalBalanceClass) => {
    setTotalBalanceState((prev) => (deepEqual(prev, val) ? prev : val));
  }, []);

  const setAddressesUnified = useCallback((val: UnifiedAddressClass[]) => {
    setAddressesUnifiedState((prev) => (deepEqual(prev, val) ? prev : val));
  }, []);

  const setAddressesTransparent = useCallback((val: TransparentAddressClass[]) => {
    setAddressesTransparentState((prev) => (deepEqual(prev, val) ? prev : val));
  }, []);

  const setValueTransferList = useCallback((val: ValueTransferClass[]) => {
    setValueTransfersState((prev) => (deepEqual(prev, val) ? prev : val));
  }, []);

  const setMessagesList = useCallback((val: ValueTransferClass[]) => {
    setMessagesState((prev) => (deepEqual(prev, val) ? prev : val));
  }, []);

  const setInfo = useCallback((newInfo: InfoClass) => {
    setInfoState((prev) => {
      if (deepEqual(prev, newInfo)) return prev;
      return newInfo;
    });
  }, []);

  const setSyncStatus = useCallback((val: SyncStatusType) => {
    setSyncingStatusState((prev) => (deepEqual(prev, val) ? prev : val));
  }, []);

  const setVerificationProgress = useCallback((val: number | null) => {
    setVerificationProgressState(val);
  }, []);

  const setFetchError = useCallback((command: string, error: string) => {
    setFetchErrorState({ command, error });
    if (fetchErrorTimer.current) clearTimeout(fetchErrorTimer.current);
    fetchErrorTimer.current = setTimeout(() => {
      fetchErrorTimer.current = null;
      setFetchErrorState({} as FetchErrorTypeClass);
    }, 5000);
  }, []);

  // ZEC price. Lives at the top level (NOT inside InfoClass) because the
  // periodic info-refresh rebuilds InfoClass and would otherwise clobber it
  // every 5s cycle. Fetched by RPC.getZecPrice over the mixnet only
  // (ADR 0024 arc 6): until Mixnet Mode wiring lands the fetch refuses,
  // the price stays 0, and the UI renders its `USD --` fallback.
  const [zecPrice, setZecPriceState] = useState<number>(0);
  const setZecPrice = useCallback((price?: number) => {
    if (typeof price === "number") setZecPriceState(price);
  }, []);

  const [mixnetView, setMixnetViewState] = useState<MixnetView>(defaultAppState.mixnetView);
  const [serverHealth, setServerHealthState] = useState<ServerHealthState>(defaultAppState.serverHealth);
  const setMixnetView = useCallback((view: MixnetView) => setMixnetViewState(view), []);
  const setServerHealth = useCallback((health: ServerHealthState) => setServerHealthState(health), []);

  // Main pushes the Mixnet Mode status on every transition (bootstrapping,
  // narration, ready, died, switched_off); project it to the view instantly so
  // the indicator never lags the transport.
  useEffect(() => {
    const listener = (_event: unknown, status: RPCMixnetStatusType) => setMixnetView(deriveMixnetView(status));
    ipcRenderer.on("mixnet-status", listener);
    return () => ipcRenderer.removeListener("mixnet-status", listener);
  }, [setMixnetView]);

  const setReadOnly = useCallback((val: boolean) => setReadOnlyState(val), []);
  const setWallets = useCallback((val: WalletType[]) => setWalletsState(val), []);
  const setBirthday = useCallback((val: number) => setBirthdayState(val), []);

  const setCurrentWallet = useCallback((val: WalletType | null) => {
    if (val !== null) rpcRef.current?.setCurrentWallet(val);
    setCurrentWalletState(val);
  }, []);

  const setCurrentWalletOpenError = useCallback((val: string) => setCurrentWalletOpenErrorState(val), []);

  const setPools = useCallback((orchard: boolean, sapling: boolean, transparent: boolean) => {
    setOrchardPoolState(orchard);
    setSaplingPoolState(sapling);
    setTransparentPoolState(transparent);
  }, []);

  const setSendPageState = useCallback((val: SendPageStateClass) => setSendPageStateState(val), []);

  // Block explorer config. Source of truth is electron-settings (`blockexplorer`
  // key); the React state mirrors it for context consumers. The setter writes
  // both atomically. Loaded at boot inside the existing `loadSettings` effect
  // below, so consumers (Sidebar, BlockExplorerModal) read it directly from
  // context with no prop drilling.
  const setBlockExplorer = useCallback(async (blockExplorer: any) => {
    setBlockExplorerState(blockExplorer);
    try {
      await ipcRenderer.invoke("saveSettings", { key: "blockexplorer", value: blockExplorer });
    } catch (e) {
      console.warn("setBlockExplorer: could not persist setting", e);
    }
  }, []);

  // Block explorer fields kept in a single object to avoid 8 useState
  const [blockExplorerConfig, setBlockExplorerState] = useState({
    blockExplorerMainnetAddress: defaultAppState.blockExplorerMainnetAddress,
    blockExplorerMainnetAddressCustom: defaultAppState.blockExplorerMainnetAddressCustom,
    blockExplorerMainnetTransaction: defaultAppState.blockExplorerMainnetTransaction,
    blockExplorerMainnetTransactionCustom: defaultAppState.blockExplorerMainnetTransactionCustom,
    blockExplorerTestnetAddress: defaultAppState.blockExplorerTestnetAddress,
    blockExplorerTestnetAddressCustom: defaultAppState.blockExplorerTestnetAddressCustom,
    blockExplorerTestnetTransaction: defaultAppState.blockExplorerTestnetTransaction,
    blockExplorerTestnetTransactionCustom: defaultAppState.blockExplorerTestnetTransactionCustom,
  });

  // --- RPC instance (stable ref, lazy init) ---
  const rpcRef = useRef<RPC | null>(null);
  if (!rpcRef.current) {
    ReactModal.setAppElement("#root");
    rpcRef.current = new RPC(
      setTotalBalance,
      setAddressesUnified,
      setAddressesTransparent,
      setValueTransferList,
      setMessagesList,
      setInfo,
      setZecPrice,
      setSyncStatus,
      setVerificationProgress,
      setFetchError,
      setMixnetView,
      setServerHealth,
      defaultAppState.currentWallet,
    );
  }

  // --- lifecycle ---
  useEffect(() => {
    (async () => {
      const book = await AddressbookImpl.readAddressBook();
      if (book && book.length > 0) setAddressBookState(book);

      const [allSettings, authAvailability] = await Promise.all([
        ipcRenderer.invoke("loadSettings"),
        ipcRenderer.invoke("auth:check"),
      ]);
      const isLocked = !!(allSettings?.requireDeviceAuth && authAvailability === "available");
      setLocked(isLocked);
      setLockChecked(true);
      if (allSettings && Object.prototype.hasOwnProperty.call(allSettings, "blockexplorer")) {
        // A previously-selected explorer may have been removed (e.g. Zypherscan).
        // Fall any obsolete value back to Zcashexplorer across the 4 explorer fields.
        const cfg = allSettings.blockexplorer;
        const fallback = (v: unknown): BlockExplorerEnum =>
          v === "Zypherscan" ? BlockExplorerEnum.Zcashexplorer : (v as BlockExplorerEnum);
        setBlockExplorerState({
          ...cfg,
          blockExplorerMainnetTransaction: fallback(cfg?.blockExplorerMainnetTransaction),
          blockExplorerTestnetTransaction: fallback(cfg?.blockExplorerTestnetTransaction),
          blockExplorerMainnetAddress: fallback(cfg?.blockExplorerMainnetAddress),
          blockExplorerTestnetAddress: fallback(cfg?.blockExplorerTestnetAddress),
        });
      }
    })();

    const appsecurityListener = () => setSecurityModalOpen(true);
    ipcRenderer.on("appsecurity", appsecurityListener);

    // Change wallet folder location — main process handles the dialog, picker, and restart.
    const changeWalletDirListener = () => {
      ipcRenderer.invoke("wallet-dir:change");
    };
    ipcRenderer.on("change-wallet-dir", changeWalletDirListener);

    // Import data from another installation — kick off the folder picker, then open the modal.
    const importDataListener = async () => {
      const result = await ipcRenderer.invoke("import:scan");
      if (result?.ok) {
        setImportScanResult(result as ImportScanResult);
        setImportModalOpen(true);
      }
      // Cancellation / no-data / same-folder errors are surfaced by main-process dialogs
      // or simply do nothing here — keep the renderer flow quiet.
    };
    ipcRenderer.on("import-data", importDataListener);

    const appquittingListener = async () => {
      // Best-effort wallet save on shutdown. The wallet is already saved
      // continuously during the session, so this is a paranoia flush — we
      // don't block the close on it for more than ~800ms. Whichever finishes
      // first (the save or the cap) lets us send `appquitdone` and have the
      // main process exit instantly.
      const savePromise = native.save_wallet_file().catch(() => {});
      const cap = new Promise<void>((resolve) => setTimeout(resolve, 800));
      await Promise.race([savePromise, cap]);
      ipcRenderer.send("appquitdone");
    };
    ipcRenderer.on("appquitting", appquittingListener);

    return () => {
      if (fetchErrorTimer.current) clearTimeout(fetchErrorTimer.current);
      ipcRenderer.off("appsecurity", appsecurityListener);
      ipcRenderer.off("change-wallet-dir", changeWalletDirListener);
      ipcRenderer.off("import-data", importDataListener);
      ipcRenderer.off("appquitting", appquittingListener);
    };
  }, []);

  // --- modals ---
  const openErrorModal = useCallback((title: string, body: string | JSX.Element) => {
    const modal = new ErrorModalClass();
    modal.modalIsOpen = true;
    modal.title = title;
    modal.body = body;
    setErrorModalState(modal);
  }, []);

  const closeErrorModal = useCallback(() => {
    const modal = new ErrorModalClass();
    modal.modalIsOpen = false;
    setErrorModalState(modal);
  }, []);

  const openConfirmModal = useCallback((title: string, body: string | JSX.Element, runAction: () => void) => {
    const modal = new ConfirmModalClass();
    modal.modalIsOpen = true;
    modal.title = title;
    modal.body = body;
    modal.runAction = runAction;
    setConfirmModalState(modal);
  }, []);

  const closeConfirmModal = useCallback(() => {
    const modal = new ConfirmModalClass();
    modal.modalIsOpen = false;
    setConfirmModalState(modal);
  }, []);

  // --- navigation ---
  const navigateToDashboard = useCallback(() => {
    navigate(routes.DASHBOARD, { replace: true, state: {} });
  }, [navigate]);

  const navigateToHistory = useCallback(() => {
    navigate(routes.HISTORY, { replace: true, state: {} });
  }, [navigate]);

  const navigateToLoadingScreen = useCallback(() => {
    navigate(routes.LOADING, { replace: true });
  }, [navigate]);

  const navigateToLoadingScreenChangingWallet = useCallback(async () => {
    setTotalBalance(new TotalBalanceClass());
    setAddressesUnified([]);
    setAddressesTransparent([]);
    setValueTransferList([]);
    setMessagesList([]);
    setInfo(new InfoClass());
    setZecPrice(0);
    setSyncStatus({} as SyncStatusType);
    setVerificationProgress(null);
    setFetchError("", "");
    setCurrentWalletOpenError("");
    setSendPageState(new SendPageStateClass());

    await rpcRef.current?.clearTimers();

    navigateToLoadingScreen();
  }, [
    navigateToLoadingScreen,
    setTotalBalance,
    setAddressesUnified,
    setAddressesTransparent,
    setValueTransferList,
    setMessagesList,
    setInfo,
    setZecPrice,
    setSyncStatus,
    setVerificationProgress,
    setFetchError,
    setCurrentWalletOpenError,
    setSendPageState,
  ]);

  // Changing the active server means reopening the wallet. `change_server` on a
  // live client swaps the URI but leaves it unable to reach the new one, so
  // every server picked that way looked dead — which is why that path sat unused
  // in the first place. Going round through LoadingScreen is what the wallet
  // settings screen already does, and it is the one that works.
  const switchServer = useCallback(
    async (target: string) => {
      const wallet: WalletType | null = currentWallet;
      if (!wallet?.uri || target === wallet.uri) {
        return;
      }
      // Probe before committing: reopening against a dead server would drop the
      // user on the wallet-open error screen instead of on their balances.
      const answered: ServerClass | null = await selectFastestServer([
        { uri: target, chain_name: wallet.chain_name, latency: null, default: false, obsolete: false },
      ]);
      if (!answered) {
        openErrorModal("Change Server", `${target} is not responding. Staying on the current server.`);
        return;
      }
      const moved: WalletType = { ...wallet, uri: target };
      await ipcRenderer.invoke("wallets:update", moved);
      await ipcRenderer.invoke("saveSettings", { key: "serveruri", value: target });
      setCurrentWallet(moved);
      setWallets(await ipcRenderer.invoke("wallets:all"));
      navigateToLoadingScreenChangingWallet();
    },
    [currentWallet, openErrorModal, setCurrentWallet, setWallets, navigateToLoadingScreenChangingWallet],
  );

  const rotateServer = useCallback(async () => {
    const wallet: WalletType | null = currentWallet;
    if (!wallet?.uri) {
      return;
    }
    const rejected: string[] = [...avoidedServers, wallet.uri];
    const target: string | null = await pickRotationTarget(wallet.chain_name, rejected);
    if (!target) {
      openErrorModal("Change Server", "No other server is available for this network.");
      return;
    }
    // Remembered before the switch: reopening the wallet runs the boot-time
    // `auto` pick again, and without this it would take the registry head
    // straight back to the server just rejected.
    setAvoidedServers(rejected);
    await switchServer(target);
  }, [avoidedServers, currentWallet, openErrorModal, switchServer]);

  // --- address book ---
  const addAddressBookEntry = useCallback((label: string, address: string, chain: ServerChainNameEnum) => {
    setAddressBookState((prev) => AddressbookImpl.addEntry(prev, label, address, chain));
  }, []);

  const removeAddressBookEntry = useCallback((label: string) => {
    setAddressBookState((prev) => AddressbookImpl.removeEntry(prev, label));
  }, []);

  // --- context actions ---
  const setSendTo = useCallback((target: ZcashURITarget): void => {
    const newState = new SendPageStateClass();
    const to = new ToAddrClass();
    if (target.address) to.to = target.address;
    if (target.amount) to.amount = target.amount;
    if (target.memoString) to.memo = target.memoString;
    newState.toaddr = to;
    setSendPageStateState(newState);
  }, []);

  const setAddLabel = useCallback((ab: AddressBookEntryClass): void => {
    setAddLabelStateState(ab);
  }, []);

  const calculateShieldFee = useCallback(async (): Promise<number> => {
    try {
      const result: string = await native.shield();
      if (!result) return 0;
      const resultJSON = JSON.parse(result);
      if (resultJSON.error) return 0;
      return resultJSON.fee ? resultJSON.fee / 10 ** 8 : 0;
    } catch (error) {
      console.error(`Critical Error calculate shield fee ${error}`);
      return 0;
    }
  }, []);

  const runRPCShieldTransparentBalanceToOrchard = useCallback(async (): Promise<string> => {
    return rpcRef.current!.shieldTransparentBalanceToIronwood();
  }, []);

  const handleShieldButtonConfirmed = useCallback(async () => {
    openErrorModal("Computing Transaction", "Please wait...This could take a while");
    setTimeout(async () => {
      try {
        // Throws on failure — the catch below surfaces it.
        const txidsResult: string = await runRPCShieldTransparentBalanceToOrchard();
        const txids: string[] = txidsResult.split(", ");
        const isMainnet = currentWallet?.chain_name === ServerChainNameEnum.mainChainName;
        openErrorModal(
          "Successfully Broadcast Transaction",
          <ShieldResultContent
            txids={txids}
            chainName={currentWallet?.chain_name}
            blockExplorerTransaction={
              isMainnet
                ? blockExplorerConfig.blockExplorerMainnetTransaction
                : blockExplorerConfig.blockExplorerTestnetTransaction
            }
            blockExplorerTransactionCustom={
              isMainnet
                ? blockExplorerConfig.blockExplorerMainnetTransactionCustom
                : blockExplorerConfig.blockExplorerTestnetTransactionCustom
            }
          />,
        );
      } catch (err) {
        openErrorModal("Error Shielding Transaction", `${err}`);
      }
    }, 10);
  }, [currentWallet, blockExplorerConfig, openErrorModal, runRPCShieldTransparentBalanceToOrchard]);

  const handleShieldButton = useCallback(() => {
    openConfirmModal("Shield Transparent Funds", "Please confirm the Action", handleShieldButtonConfirmed);
  }, [openConfirmModal, handleShieldButtonConfirmed]);

  const runRPCRescan = useCallback(() => {
    openConfirmModal("Rescan Wallet", "Please confirm the Action", async () => {
      await rpcRef.current?.refreshSync(true);
    });
  }, [openConfirmModal]);

  const runRPCSendTransaction = useCallback(async (sendJson: SendManyJsonType[]): Promise<string> => {
    try {
      const result: string = await rpcRef.current!.sendTransaction(sendJson);
      if (!result) throw result;
      return result;
    } catch (err) {
      console.error("route sendtx error", err);
      throw err;
    }
  }, []);

  const runRPCDrainToIronwood = useCallback(async (): Promise<{
    result: RPCIronwoodDrainType | null;
    error: string;
  }> => {
    return rpcRef.current!.drainOrchardToIronwood();
  }, []);

  // --- P4: memoized context value ---
  const contextAppState = useMemo<AppState>(
    () => ({
      totalBalance,
      addressesUnified,
      addressesTransparent,
      addressBook,
      valueTransfers,
      messages,
      sendPageState,
      info,
      syncingStatus,
      verificationProgress,
      readOnly,
      fetchError,
      currentWallet,
      currentWalletOpenError,
      wallets,
      birthday,
      orchardPool,
      saplingPool,
      transparentPool,
      addLabelState,
      errorModal,
      confirmModal,
      openErrorModal,
      closeErrorModal,
      openConfirmModal,
      closeConfirmModal,
      setSendTo,
      calculateShieldFee,
      handleShieldButton,
      setAddLabel,
      zecPrice,
      mixnetView,
      serverHealth,
      rotateServer,
      switchServer,
      reopenWallet: navigateToLoadingScreenChangingWallet,
      avoidedServers,
      blockExplorerMainnetAddress: blockExplorerConfig.blockExplorerMainnetAddress,
      blockExplorerMainnetAddressCustom: blockExplorerConfig.blockExplorerMainnetAddressCustom,
      blockExplorerMainnetTransaction: blockExplorerConfig.blockExplorerMainnetTransaction,
      blockExplorerMainnetTransactionCustom: blockExplorerConfig.blockExplorerMainnetTransactionCustom,
      blockExplorerTestnetAddress: blockExplorerConfig.blockExplorerTestnetAddress,
      blockExplorerTestnetAddressCustom: blockExplorerConfig.blockExplorerTestnetAddressCustom,
      blockExplorerTestnetTransaction: blockExplorerConfig.blockExplorerTestnetTransaction,
      blockExplorerTestnetTransactionCustom: blockExplorerConfig.blockExplorerTestnetTransactionCustom,
      setBlockExplorer,
    }),
    [
      totalBalance,
      addressesUnified,
      addressesTransparent,
      addressBook,
      valueTransfers,
      messages,
      sendPageState,
      info,
      syncingStatus,
      verificationProgress,
      readOnly,
      fetchError,
      currentWallet,
      currentWalletOpenError,
      wallets,
      birthday,
      orchardPool,
      saplingPool,
      transparentPool,
      addLabelState,
      errorModal,
      confirmModal,
      openErrorModal,
      closeErrorModal,
      openConfirmModal,
      closeConfirmModal,
      setSendTo,
      calculateShieldFee,
      handleShieldButton,
      setAddLabel,
      zecPrice,
      mixnetView,
      serverHealth,
      rotateServer,
      switchServer,
      navigateToLoadingScreenChangingWallet,
      avoidedServers,
      blockExplorerConfig,
      setBlockExplorer,
    ],
  );

  if (!lockChecked) return null;

  if (locked) {
    return (
      <ContextAppProvider value={contextAppState}>
        <LockScreen onUnlock={() => setLocked(false)} />
      </ContextAppProvider>
    );
  }

  return (
    <ContextAppProvider value={contextAppState}>
      <AppSecurityModal isOpen={securityModalOpen} onClose={() => setSecurityModalOpen(false)} />
      <ImportDataModal
        isOpen={importModalOpen}
        scanResult={importScanResult}
        onClose={() => {
          setImportModalOpen(false);
          setImportScanResult(null);
        }}
      />

      {confirmModal.modalIsOpen && <ConfirmModal closeModal={closeConfirmModal} />}
      {errorModal.modalIsOpen && <ErrorModal closeModal={closeErrorModal} />}

      <div style={{ overflow: "hidden" }}>
        {location.pathname !== "/" && !location.pathname.toLowerCase().includes("zingo") && (
          <div className={cstyles.sidebarcontainer}>
            <Sidebar
              doRescan={runRPCRescan}
              navigateToLoadingScreenChangingWallet={navigateToLoadingScreenChangingWallet}
            />
          </div>
        )}

        <div className={cstyles.contentcontainer}>
          <Routes>
            <Route
              path={routes.SEND}
              element={<Send sendTransaction={runRPCSendTransaction} setSendPageState={setSendPageState} />}
            />
            <Route path={routes.RECEIVE} element={<Receive />} />
            <Route
              path={routes.ADDRESSBOOK}
              element={
                <AddressBook
                  addAddressBookEntry={addAddressBookEntry}
                  removeAddressBookEntry={removeAddressBookEntry}
                />
              }
            />
            <Route path={routes.DASHBOARD} element={<Dashboard navigateToHistory={navigateToHistory} />} />
            <Route path={routes.INSIGHT} element={<Insight />} />
            <Route path={routes.HISTORY} element={<History />} />
            <Route path={routes.MESSAGES} element={<Messages />} />
            <Route path={routes.MIGRATION} element={<OrchardMigration drainToIronwood={runRPCDrainToIronwood} />} />
            <Route
              path={routes.ADDNEWWALLET}
              element={
                <AddNewWallet
                  closeModal={navigateToDashboard}
                  setWallets={setWallets}
                  setCurrentWallet={setCurrentWallet}
                  navigateToLoadingScreenChangingWallet={navigateToLoadingScreenChangingWallet}
                  doSaveWallet={() => RPC.doSave()}
                  clearTimers={() => rpcRef.current?.clearTimers() ?? Promise.resolve()}
                />
              }
            />
            <Route
              path={routes.LOADING}
              element={
                <LoadingScreen
                  runRPCConfigure={() => rpcRef.current?.configure()}
                  setInfo={setInfo}
                  setReadOnly={setReadOnly}
                  navigateToDashboard={navigateToDashboard}
                  setBirthday={setBirthday}
                  setPools={setPools}
                  setWallets={setWallets}
                  setCurrentWallet={setCurrentWallet}
                  setCurrentWalletOpenError={setCurrentWalletOpenError}
                  setFetchError={setFetchError}
                />
              }
            />
          </Routes>
        </div>
      </div>
    </ContextAppProvider>
  );
};

export default AppRoutes;
