import React from "react";
import ReactModal from "react-modal";
import { Switch, Route, withRouter, RouteComponentProps } from "react-router";
import { isEqual } from "lodash";
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
  ServerClass,
  FetchErrorTypeClass,
  UnifiedAddressClass,
  TransparentAddressClass,
  SyncStatusType,
  ConfirmModalClass,
  ErrorModalClass,
  WalletType,
  ServerChainNameEnum,
} from "../components/appstate";
import RPC from "../rpc/rpc";
import { ZcashURITarget } from "../utils/uris";
import { AddNewWallet } from "../components/addNewWallet";
import { AddressBook, AddressbookImpl } from "../components/addressBook";
import { Sidebar } from "../components/sideBar";
import { History } from "../components/history";
import { ContextAppProvider, defaultAppState } from "../context/ContextAppState";

import { native } from "../electronBridge";
import { Messages } from "../components/messages";
import { ConfirmModal } from "../components/confirmModal";
import ShieldResultContent from "./ShieldResultContent";

type Props = {};

class Routes extends React.Component<Props & RouteComponentProps, AppState> {
  rpc: RPC;
  fetchErrorTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(props: Props & RouteComponentProps) {
    super(props);

    this.state = defaultAppState;

    // Set the Modal's app element
    ReactModal.setAppElement("#root");

    this.rpc = new RPC(
      this.setTotalBalance,
      this.setAddressesUnified,
      this.setAddressesTransparent,
      this.setValueTransferList,
      this.setMessagesList,
      this.setInfo,
      this.setZecPrice,
      this.setSyncStatus,
      this.setVerificationProgress,
      this.setFetchError,
      this.state.currentWallet,
    );
  }

  componentDidMount = async () => {
    const addressBook: AddressBookEntryClass[] = await AddressbookImpl.readAddressBook();
    if (addressBook && addressBook.length > 0) {
      this.setState({ addressBook });
    }
  };

  componentWillUnmount = () => {
    if (this.fetchErrorTimer) clearTimeout(this.fetchErrorTimer);
  };

  openErrorModal = (title: string, body: string | JSX.Element) => {
    const errorModal = new ErrorModalClass();
    errorModal.modalIsOpen = true;
    errorModal.title = title;
    errorModal.body = body;

    this.setState({ errorModal });
  };

  closeErrorModal = () => {
    const errorModal = new ErrorModalClass();
    errorModal.modalIsOpen = false;

    this.setState({ errorModal });
  };

  openConfirmModal = (title: string, body: string | JSX.Element, runAction: () => void) => {
    const confirmModal = new ConfirmModalClass();
    confirmModal.modalIsOpen = true;
    confirmModal.title = title;
    confirmModal.body = body;
    confirmModal.runAction = runAction;

    this.setState({ confirmModal });
  };

  closeConfirmModal = () => {
    const confirmModal = new ConfirmModalClass();
    confirmModal.modalIsOpen = false;

    this.setState({ confirmModal });
  };

  doSaveWallet = () => {
    RPC.doSave();
  };

  setTotalBalance = (totalBalance: TotalBalanceClass) => {
    if (!isEqual(totalBalance, this.state.totalBalance)) {
      //console.log('=============== total SPENDABLE balance', totalBalance.totalSpendableBalance);
      //console.log('=============== total balance', totalBalance);
      this.setState({ totalBalance });
    }
  };

  setFetchError = (command: string, error: string) => {
    console.log("=============== fetch error", command, error);
    this.setState({
      fetchError: {
        command,
        error,
      },
    });
    if (this.fetchErrorTimer) clearTimeout(this.fetchErrorTimer);
    this.fetchErrorTimer = setTimeout(() => {
      this.fetchErrorTimer = null;
      this.setState({ fetchError: {} as FetchErrorTypeClass });
    }, 5000);
  };

  setAddressesUnified = (addressesUnified: UnifiedAddressClass[]) => {
    if (!isEqual(addressesUnified, this.state.addressesUnified)) {
      console.log("=============== addresses UA", addressesUnified.length);
      this.setState({ addressesUnified });
    }
  };

  setAddressesTransparent = (addressesTransparent: TransparentAddressClass[]) => {
    if (!isEqual(addressesTransparent, this.state.addressesTransparent)) {
      console.log("=============== addresses T", addressesTransparent.length);
      this.setState({ addressesTransparent });
    }
  };

  setValueTransferList = (valueTransfers: ValueTransferClass[]) => {
    if (!isEqual(valueTransfers, this.state.valueTransfers)) {
      console.log("=============== ValueTransfer list", valueTransfers.length);
      this.setState({ valueTransfers });
    }
  };

  setMessagesList = (messages: ValueTransferClass[]) => {
    if (!isEqual(messages, this.state.messages)) {
      console.log("=============== ValueTransfer Messages list", messages.length);
      this.setState({ messages });
    }
  };

  setSendPageState = (sendPageState: SendPageStateClass) => {
    console.log("=============== send page state", sendPageState);
    this.setState({ sendPageState });
  };

  setSendTo = (target: ZcashURITarget): void => {
    console.log("=============== send to", target);
    // Clear the existing send page state and set up the new one
    const newSendPageState = new SendPageStateClass();

    const to = new ToAddrClass();
    if (target.address) {
      to.to = target.address;
    }
    if (target.amount) {
      to.amount = target.amount;
    }
    if (target.memoString) {
      to.memo = target.memoString;
    }

    newSendPageState.toaddr = to;

    this.setState({ sendPageState: newSendPageState });
  };

  setAddLabel = (ab: AddressBookEntryClass): void => {
    console.log("=============== add label state", ab);
    this.setState({ addLabelState: ab });
  };

  runRPCConfigure = () => {
    console.log("=============== rpc configure");

    this.rpc.configure();
  };

  setZecPrice = (price?: number) => {
    console.log("=============== price", price);
    if (!!price && price !== this.state.info.zecPrice) {
      const { info } = this.state;

      const newInfo = new InfoClass();
      Object.assign(newInfo, info);
      newInfo.zecPrice = price;

      this.setState({ info: newInfo });
    }
  };

  setReadOnly = (readOnly: boolean) => {
    this.setState({ readOnly });
  };

  setServerUris = (serverUris: ServerClass[]) => {
    this.setState({ serverUris });
  };

  setInfo = (newInfo: InfoClass) => {
    if (!isEqual(newInfo, this.state.info)) {
      console.log("=============== info", newInfo);
      // If the price is not set in this object, copy it over from the current object
      const { info } = this.state;
      if (!newInfo.zecPrice) {
        newInfo.zecPrice = info.zecPrice;
      }

      this.setState({ info: newInfo });
    }
  };

  setSyncStatus = (syncingStatus: SyncStatusType) => {
    if (!isEqual(this.state.syncingStatus, syncingStatus)) {
      this.setState({ syncingStatus });
    }
  };

  setWallets = (wallets: WalletType[]) => {
    this.setState({
      wallets,
    });
  };

  setCurrentWallet = (currentWallet: WalletType | null) => {
    if (currentWallet !== null) {
      this.rpc.setCurrentWallet(currentWallet);
    }
    this.setState({
      currentWallet,
    });
  };

  setCurrentWalletOpenError = (error: string) => {
    this.setState({
      currentWalletOpenError: error,
    });
  };

  setRecoveryInfo = (seed_phrase: string, ufvk: string, birthday: number) => {
    this.setState({
      seed_phrase,
      ufvk,
      birthday,
    });
  };

  setPools = (orchardPool: boolean, saplingPool: boolean, transparentPool: boolean) => {
    this.setState({
      orchardPool,
      saplingPool,
      transparentPool,
    });
  };

  setVerificationProgress = (verificationProgress: number | null) => {
    this.setState({ verificationProgress });
  };

  setBlockExplorer = (blockExplorer: any) => {
    this.setState({
      blockExplorerMainnetAddress: blockExplorer.blockExplorerMainnetAddress,
      blockExplorerMainnetAddressCustom: blockExplorer.blockExplorerMainnetAddressCustom,
      blockExplorerMainnetTransaction: blockExplorer.blockExplorerMainnetTransaction,
      blockExplorerMainnetTransactionCustom: blockExplorer.blockExplorerMainnetTransactionCustom,
      blockExplorerTestnetAddress: blockExplorer.blockExplorerTestnetAddress,
      blockExplorerTestnetAddressCustom: blockExplorer.blockExplorerTestnetAddressCustom,
      blockExplorerTestnetTransaction: blockExplorer.blockExplorerTestnetTransaction,
      blockExplorerTestnetTransactionCustom: blockExplorer.blockExplorerTestnetTransactionCustom,
    });
  };

  runRPCSendTransaction = async (sendJson: SendManyJsonType[]): Promise<string> => {
    try {
      const result: string = await this.rpc.sendTransaction(sendJson);

      if (!result || result.toLowerCase().startsWith("error")) {
        throw result;
      }

      return result;
    } catch (err) {
      console.log("route sendtx error", err);
      throw err;
    }
  };

  addAddressBookEntry = (label: string, address: string): void => {
    this.setState({ addressBook: AddressbookImpl.addEntry(this.state.addressBook, label, address) });
  };

  removeAddressBookEntry = (label: string): void => {
    this.setState({ addressBook: AddressbookImpl.removeEntry(this.state.addressBook, label) });
  };

  runRPCfectchInfo = () => {
    this.rpc.fetchInfo();
  };

  runRPCRescan = () => {
    this.openConfirmModal("Rescan Wallet", "Please confirm the Action", async () => {
      await this.rpc.refreshSync(true);
    });
  };

  runRPCClearTimers = async () => {
    await this.rpc.clearTimers();
  };

  calculateShieldFee = async (): Promise<number> => {
    try {
      const result: string = await native.shield();
      //console.log(result);
      if (!result || result.toLowerCase().startsWith("error")) {
        return 0;
      } else {
        const resultJSON = JSON.parse(result);
        if (resultJSON.error) {
          return 0;
        } else if (resultJSON.fee) {
          return resultJSON.fee / 10 ** 8;
        } else {
          return 0;
        }
      }
    } catch (error) {
      console.log(`Critical Error calculate shield fee ${error}`);
      return 0;
    }
  };

  runRPCShieldTransparentBalanceToOrchard = async (): Promise<string> => {
    const result: string = await this.rpc.shieldTransparentBalanceToOrchard();
    return result;
  };

  handleShieldButton = () => {
    this.openConfirmModal("Shield Transparent Funds", "Please confirm the Action", () =>
      this.handleShieldButtonConfirmed(),
    );
  };

  handleShieldButtonConfirmed = () => {
    // This will be replaced by either a success TXID or error message that the user
    // has to close manually.
    this.openErrorModal("Computing Transaction", "Please wait...This could take a while");

    setTimeout(async () => {
      try {
        const txidsResult: string = await this.runRPCShieldTransparentBalanceToOrchard();

        if (!txidsResult || txidsResult.toLocaleLowerCase().startsWith("error")) {
          this.openErrorModal("Error Shielding Transaction", `${txidsResult}`);
          return;
        }

        const txids: string[] = txidsResult.split(", ");
        const isMainnet = this.state.currentWallet?.chain_name === ServerChainNameEnum.mainChainName;
        this.openErrorModal(
          "Successfully Broadcast Transaction",
          <ShieldResultContent
            txids={txids}
            chainName={this.state.currentWallet?.chain_name}
            blockExplorerTransaction={
              isMainnet ? this.state.blockExplorerMainnetTransaction : this.state.blockExplorerTestnetTransaction
            }
            blockExplorerTransactionCustom={
              isMainnet
                ? this.state.blockExplorerMainnetTransactionCustom
                : this.state.blockExplorerTestnetTransactionCustom
            }
          />,
        );
      } catch (err) {
        this.openErrorModal("Error Shielding Transaction", `${err}`);
      }
    }, 10);
  };

  navigateToDashboard = () => {
    this.props.history.replace({
      pathname: routes.DASHBOARD,
      state: {},
    });
  };

  navigateToHistory = () => {
    this.props.history.replace({
      pathname: routes.HISTORY,
      state: {},
    });
  };

  navigateToLoadingScreen = () => {
    this.props.history.replace({
      pathname: routes.LOADING,
      state: {
        serverUris: this.state.serverUris,
      },
    });
  };

  navigateToLoadingScreenChangingWallet = async () => {
    // To change to another wallet, we reset the wallet loading
    // and redirect to the loading screen
    this.setTotalBalance(new TotalBalanceClass());
    this.setAddressesUnified([]);
    this.setAddressesTransparent([]);
    this.setValueTransferList([]);
    this.setMessagesList([]);
    this.setInfo(new InfoClass());
    this.setZecPrice(0);
    this.setSyncStatus({} as SyncStatusType);
    this.setVerificationProgress(null);
    this.setFetchError("", "");
    this.setCurrentWalletOpenError("");

    await this.rpc.clearTimers();

    this.navigateToLoadingScreen();
  };

  render() {
    const contextAppState: AppState = {
      totalBalance: this.state.totalBalance,
      addressesUnified: this.state.addressesUnified,
      addressesTransparent: this.state.addressesTransparent,
      addressBook: this.state.addressBook,
      valueTransfers: this.state.valueTransfers,
      messages: this.state.messages,
      sendPageState: this.state.sendPageState,
      info: this.state.info,
      syncingStatus: this.state.syncingStatus,
      verificationProgress: this.state.verificationProgress,
      readOnly: this.state.readOnly,
      serverUris: this.state.serverUris,
      fetchError: this.state.fetchError,
      currentWallet: this.state.currentWallet,
      currentWalletOpenError: this.state.currentWalletOpenError,
      wallets: this.state.wallets,
      seed_phrase: this.state.seed_phrase,
      ufvk: this.state.ufvk,
      birthday: this.state.birthday,
      orchardPool: this.state.orchardPool,
      saplingPool: this.state.saplingPool,
      transparentPool: this.state.transparentPool,
      addLabelState: this.state.addLabelState,
      errorModal: this.state.errorModal,
      confirmModal: this.state.confirmModal,
      openErrorModal: this.openErrorModal,
      closeErrorModal: this.closeErrorModal,
      openConfirmModal: this.openConfirmModal,
      closeConfirmModal: this.state.closeConfirmModal,
      setSendTo: this.setSendTo,
      calculateShieldFee: this.calculateShieldFee,
      handleShieldButton: this.handleShieldButton,
      setAddLabel: this.setAddLabel,
      blockExplorerMainnetAddress: this.state.blockExplorerMainnetAddress,
      blockExplorerMainnetAddressCustom: this.state.blockExplorerMainnetAddressCustom,
      blockExplorerMainnetTransaction: this.state.blockExplorerMainnetTransaction,
      blockExplorerMainnetTransactionCustom: this.state.blockExplorerMainnetTransactionCustom,
      blockExplorerTestnetAddress: this.state.blockExplorerTestnetAddress,
      blockExplorerTestnetAddressCustom: this.state.blockExplorerTestnetAddressCustom,
      blockExplorerTestnetTransaction: this.state.blockExplorerTestnetTransaction,
      blockExplorerTestnetTransactionCustom: this.state.blockExplorerTestnetTransactionCustom,
    };

    return (
      <ContextAppProvider value={contextAppState}>
        {this.state.confirmModal.modalIsOpen && <ConfirmModal closeModal={this.closeConfirmModal} />}
        {this.state.errorModal.modalIsOpen && <ErrorModal closeModal={this.closeErrorModal} />}

        <div style={{ overflow: "hidden" }}>
          {this.props.location.pathname !== "/" && !this.props.location.pathname.toLowerCase().includes("zingo") && (
            <div className={cstyles.sidebarcontainer}>
              <Sidebar
                doRescan={this.runRPCRescan}
                navigateToLoadingScreenChangingWallet={this.navigateToLoadingScreenChangingWallet}
                setBlockExplorer={this.setBlockExplorer}
              />
            </div>
          )}

          <div className={cstyles.contentcontainer}>
            <Switch>
              <Route
                path={routes.SEND}
                render={() => (
                  <Send sendTransaction={this.runRPCSendTransaction} setSendPageState={this.setSendPageState} />
                )}
              />
              <Route path={routes.RECEIVE} render={() => <Receive />} />
              <Route
                path={routes.ADDRESSBOOK}
                render={() => (
                  <AddressBook
                    addAddressBookEntry={this.addAddressBookEntry}
                    removeAddressBookEntry={this.removeAddressBookEntry}
                  />
                )}
              />
              <Route path={routes.DASHBOARD} render={() => <Dashboard navigateToHistory={this.navigateToHistory} />} />
              <Route path={routes.INSIGHT} render={() => <Insight />} />
              <Route path={routes.HISTORY} render={() => <History />} />
              <Route path={routes.MESSAGES} render={() => <Messages />} />

              <Route
                path={routes.ADDNEWWALLET}
                render={(props) => (
                  <AddNewWallet
                    {...props}
                    closeModal={() => this.navigateToDashboard()}
                    setWallets={this.setWallets}
                    setCurrentWallet={this.setCurrentWallet}
                    navigateToLoadingScreenChangingWallet={this.navigateToLoadingScreenChangingWallet}
                    doSaveWallet={this.doSaveWallet}
                    clearTimers={this.runRPCClearTimers}
                  />
                )}
              />

              <Route
                path={routes.LOADING}
                render={() => (
                  <LoadingScreen
                    runRPCConfigure={this.runRPCConfigure}
                    setInfo={this.setInfo}
                    setReadOnly={this.setReadOnly}
                    setServerUris={this.setServerUris}
                    navigateToDashboard={this.navigateToDashboard}
                    setRecoveryInfo={this.setRecoveryInfo}
                    setPools={this.setPools}
                    setWallets={this.setWallets}
                    setCurrentWallet={this.setCurrentWallet}
                    setCurrentWalletOpenError={this.setCurrentWalletOpenError}
                    setFetchError={this.setFetchError}
                    setBlockExplorer={this.setBlockExplorer}
                  />
                )}
              />
            </Switch>
          </div>
        </div>
      </ContextAppProvider>
    );
  }
}

// @ts-ignore
export default withRouter(Routes);
