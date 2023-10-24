import React from "react";
import ReactModal from "react-modal";
import { Switch, Route, withRouter, RouteComponentProps } from "react-router";
import { isEqual } from 'lodash';
import deepDiff from 'deep-diff';
import { ErrorModal, ErrorModalData } from "../components/errormodal";
import cstyles from "../components/common/Common.module.css";
import routes from "../constants/routes.json";
import Dashboard from "../components/dashboard/Dashboard";
import { Send, SendManyJsonType } from "../components/send";
import Receive from "../components/receive/Receive";
import LoadingScreen from "../components/loadingscreen/LoadingScreen";
import {
  AppState,
  TotalBalance,
  Transaction,
  SendPageState,
  ToAddr,
  RPCConfig,
  Info,
  ReceivePageState,
  AddressBookEntry,
  PasswordState,
  ServerSelectState,
  SendProgress,
  AddressType,
  Address,
  WalletSettings,
} from "../components/appstate";
import RPC from "../rpc/rpc";
import Utils from "../utils/utils";
import { ZcashURITarget } from "../utils/uris";
import Zcashd from "../components/zcashd/Zcashd";
import AddressBook from "../components/addressbook/Addressbook";
import AddressbookImpl from "../components/addressbook/AddressbookImpl";
import Sidebar from "../components/sidebar/Sidebar";
import Transactions from "../components/transactions/Transactions";
import PasswordModal from "../components/passwordmodal/PasswordModal";
import ServerSelectModal from "../components/serverselectmodal/ServerSelectModal";
import { ContextAppProvider, defaultAppState } from "../context/ContextAppState";

import Logo from "../assets/img/logobig.png";

type Props = {};

class Routes extends React.Component<Props & RouteComponentProps, AppState> {
  rpc: RPC;

  constructor(props: Props & RouteComponentProps) {
    super(props);

    this.state = defaultAppState;

    // Create the initial ToAddr box
    this.state.sendPageState.toaddrs = [new ToAddr(Utils.getNextToAddrID())];

    // Set the Modal's app element
    ReactModal.setAppElement("#root");

    this.rpc = new RPC(
      this.setTotalBalance,
      this.setAddresses,
      this.setTransactionList,
      this.setInfo,
      this.setZecPrice,
      this.setWalletSettings,
      this.setVerificationProgress
    );
  };

  componentDidMount() {
    // Read the address book
    (async () => {
      const addressBook: AddressBookEntry[] = await AddressbookImpl.readAddressBook();
      if (addressBook) {
        this.setState({ addressBook });
      }
    })();
  };

  componentWillUnmount() {};

  getFullState = (): AppState => {
    return this.state;
  };

  openErrorModal = (title: string, body: string | JSX.Element) => {
    const errorModalData = new ErrorModalData();
    errorModalData.modalIsOpen = true;
    errorModalData.title = title;
    errorModalData.body = body;

    this.setState({ errorModalData });
  };

  closeErrorModal = () => {
    const errorModalData = new ErrorModalData();
    errorModalData.modalIsOpen = false;

    this.setState({ errorModalData });
  };

  openServerSelectModal = () => {
    const serverSelectState = new ServerSelectState();
    serverSelectState.modalIsOpen = true;

    this.setState({ serverSelectState });
  };

  closeServerSelectModal = () => {
    const serverSelectState = new ServerSelectState();
    serverSelectState.modalIsOpen = false;

    this.setState({ serverSelectState });
  };

  openPassword = (
    confirmNeeded: boolean,
    passwordCallback: (p: string) => void,
    closeCallback: () => void,
    helpText?: string | JSX.Element
  ) => {
    const passwordState = new PasswordState();

    passwordState.showPassword = true;
    passwordState.confirmNeeded = confirmNeeded;
    passwordState.helpText = helpText || "";

    // Set the callbacks, but before calling them back, we close the modals
    passwordState.passwordCallback = (password: string) => {
      this.setState({ passwordState: new PasswordState() });

      // Call the callback after a bit, so as to give time to the modal to close
      setTimeout(() => passwordCallback(password), 10);
    };
    passwordState.closeCallback = () => {
      this.setState({ passwordState: new PasswordState() });

      // Call the callback after a bit, so as to give time to the modal to close
      setTimeout(() => closeCallback(), 10);
    };

    this.setState({ passwordState });
  };

  // This will:
  //  1. Check if the wallet is encrypted and locked
  //  2. If it is, open the password dialog
  //  3. Attempt to unlock wallet.
  //    a. If unlock succeeds, do the callback
  //    b. If the unlock fails, show an error
  //  4. If wallet is not encrypted or already unlocked, just call the successcallback.
  openPasswordAndUnlockIfNeeded = (successCallback: () => void) => {
    // always is a success
    // TODO: I need to change this or removed.
    successCallback();

    // Check if it is locked
    /*
    const { info } = this.state;

    if (info.encrypted && info.locked) {
      this.openPassword(
        false,
        (password: string) => {
          (async () => {
            const success: boolean = await this.unlockWallet(password);

            if (success) {
              // If the unlock succeeded, do the submit
              successCallback();
            } else {
              this.openErrorModal("Wallet unlock failed", "Could not unlock the wallet with the password.");
            }
          })();
        },
        // Close callback is a no-op
        () => {}
      );
    } else {
      successCallback();
    }
    */
  };

  unlockWallet = async (password: string): Promise<boolean> => {
    const success: boolean = await this.rpc.unlockWallet(password);

    return success;
  };

  lockWallet = async (): Promise<boolean> => {
    const success: boolean = await this.rpc.lockWallet();
    return success;
  };

  encryptWallet = async (password: string): Promise<boolean> => {
    const success: boolean = await this.rpc.encryptWallet(password);
    return success;
  };

  decryptWallet = async (password: string): Promise<boolean> => {
    const success: boolean = await this.rpc.decryptWallet(password);
    return success;
  };

  setTotalBalance = (totalBalance: TotalBalance) => {
    if (!isEqual(totalBalance, this.state.totalBalance)) {
      console.log('=============== total balance', totalBalance);
      this.setState({ totalBalance });
    }
  };

  setWalletSettings = (walletSettings: WalletSettings) => {
    if (!isEqual(walletSettings, this.state.walletSettings)) {
      console.log('=============== wallet settings', walletSettings);
      this.setState({ walletSettings });
    }
  };

  updateWalletSettings = async () => {
    await this.rpc.fetchWalletSettings();
  };

  setAddresses = (addresses: Address[]) => {
    if (deepDiff(addresses, this.state.addresses)) {
      console.log('=============== addresses', addresses.length);
      this.setState({ addresses });
    }

    const { sendPageState } = this.state;
    // If there is no 'from' address, we'll set a default one
    if (!sendPageState.fromaddr) {
      // Find a u-address with the highest balance
      const defaultAB: Address | null = addresses
        .filter((ab) => ab.type === AddressType.unified)
        .reduce((prev: Address | null, ab) => {
          // We'll start with a unified address
          if (!prev) {
            return ab;
          } else if (prev.balance < ab.balance) {
            // Find the unified address with the highest balance
            return ab;
          } else {
            return prev;
          }
        }, null);

      if (defaultAB) {
        const newSendPageState = new SendPageState();
        newSendPageState.fromaddr = defaultAB.address;
        newSendPageState.toaddrs = sendPageState.toaddrs;

        console.log('=============== default fromaddr', defaultAB.address);

        this.setState({ sendPageState: newSendPageState });
      }
    }
  };

  setTransactionList = (transactions: Transaction[]) => {
    if (deepDiff(transactions, this.state.transactions)) {
      console.log('=============== transaction list', transactions);
      this.setState({ transactions });
    }
  };

  setSendPageState = (sendPageState: SendPageState) => {
    console.log('=============== send page state', sendPageState);
    this.setState({ sendPageState });
  };

  importPrivKeys = (keys: string[], birthday: string): boolean => {
    console.log(keys);

    for (let i: number = 0; i < keys.length; i++) {
      const result: string = RPC.doImportPrivKey(keys[i], birthday);
      if (result === "OK") {
        return true;
      } else {
        this.openErrorModal(
          "Failed to import key",
          <span>
            A private key failed to import.
            <br />
            The error was:
            <br />
            {result}
          </span>
        );

        return false;
      }
    }

    return true;
  };

  setSendTo = (targets: ZcashURITarget[] | ZcashURITarget): void => {
    console.log('=============== send to', targets);
    // Clear the existing send page state and set up the new one
    const { sendPageState } = this.state;

    const newSendPageState = new SendPageState();
    newSendPageState.toaddrs = [];
    newSendPageState.fromaddr = sendPageState.fromaddr;

    // If a single object is passed, accept that as well. 
    let tgts: ZcashURITarget | ZcashURITarget[] = targets;
    if (!Array.isArray(tgts)) {
      tgts = [targets as ZcashURITarget];
    }

    tgts.forEach((tgt) => {
      const to = new ToAddr(Utils.getNextToAddrID());
      if (tgt.address) {
        to.to = tgt.address;
      }
      if (tgt.amount) {
        to.amount = tgt.amount;
      }
      if (tgt.memoString) {
        to.memo = tgt.memoString;
      }

      newSendPageState.toaddrs.push(to);
    });

    this.setState({ sendPageState: newSendPageState });
  };

  setRPCConfig = (rpcConfig: RPCConfig) => {
    console.log('=============== rpc config', rpcConfig);
    this.setState({ rpcConfig });
    console.log(rpcConfig);
  
    this.rpc.configure(rpcConfig);
  };

  setZecPrice = (price?: number) => {
    console.log('=============== price', price);
    if (!!price && price !== this.state.info.zecPrice) {
      console.log(`Price = ${price}`);
      const { info } = this.state;
  
      const newInfo = new Info();
      Object.assign(newInfo, info);
      newInfo.zecPrice = price;
  
      this.setState({ info: newInfo });  
    }
  };

  setRescanning = (rescanning: boolean, prevSyncId: number) => {
    if (rescanning !== this.state.rescanning) {
      this.setState({ rescanning });
    }
    if (prevSyncId !== this.state.prevSyncId) {
      this.setState({ prevSyncId });
    }
  };

  setReadOnly = (readOnly: boolean) => {
    this.setState({ readOnly });
  };

  setInfo = (newInfo: Info) => {
    if (!isEqual(newInfo, this.state.info)) {
      console.log('=============== info', newInfo);
      // If the price is not set in this object, copy it over from the current object 
      const { info } = this.state;
      if (!newInfo.zecPrice) {
        newInfo.zecPrice = info.zecPrice;
      }

      //console.log(newInfo);

      this.setState({ info: newInfo });
    }
  };

  setVerificationProgress = (verificationProgress: number) => {
    if (verificationProgress !== this.state.verificationProgress) {
      this.setState({ verificationProgress });
    }
  };

  sendTransaction = async (sendJson: SendManyJsonType[], setSendProgress: (p?: SendProgress) => void): Promise<string> => {
    try {
      const txid: string = await this.rpc.sendTransaction(sendJson, setSendProgress);

      if (txid.toLowerCase().startsWith("error")) {
        throw txid;
      }

      return txid;
    } catch (err) {
      console.log("route sendtx error", err);
      throw err;
    }
  };

  // Get a single private key for this address, and return it as a string.
  // Wallet needs to be unlocked
  getPrivKeyAsString = async (address: string): Promise<string> => {
    const pk: string = await RPC.getPrivKeyAsString(address);
    return pk;
  };

  // Getter methods, which are called by the components to update the state
  fetchAndSetSinglePrivKey = async (address: string) => {
    this.openPasswordAndUnlockIfNeeded(async () => {
      let key: string = await RPC.getPrivKeyAsString(address);
      if (key === "") {
        key = "<No Key Available>";
      }
      const addressPrivateKeys = new Map();
      addressPrivateKeys.set(address, key);

      this.setState({ addressPrivateKeys });
    });
  };

  fetchAndSetSingleViewKey = async (address: string) => {
    this.openPasswordAndUnlockIfNeeded(async () => {
      const key: string = await RPC.getViewKeyAsString(address);
      const addressViewKeys = new Map();
      addressViewKeys.set(address, key);

      this.setState({ addressViewKeys });
    });
  };

  addAddressBookEntry = (label: string, address: string): void => {
    // Add an entry into the address book
    const { addressBook } = this.state;
    const newAddressBook: AddressBookEntry[] = addressBook.concat(new AddressBookEntry(label, address));

    // Write to disk. This method is async
    AddressbookImpl.writeAddressBook(newAddressBook);

    this.setState({ addressBook: newAddressBook });
  };

  removeAddressBookEntry = (label: string): void => {
    const { addressBook } = this.state;
    const newAddressBook: AddressBookEntry[] = addressBook.filter((i) => i.label !== label);

    // Write to disk. This method is async
    AddressbookImpl.writeAddressBook(newAddressBook);

    this.setState({ addressBook: newAddressBook });
  };

  createNewAddress = async (newType: AddressType) => {
    this.openPasswordAndUnlockIfNeeded(async () => {
      // Create a new address
      const newAddress: any = await RPC.createNewAddress(newType);
      console.log(`Created new Address ${newAddress}`);

      // And then fetch the list of addresses again to refresh (totalBalance gets all addresses)
      this.rpc.fetchTotalBalance();

      const { receivePageState } = this.state;
      const newRerenderKey: number = receivePageState.rerenderKey + 1;

      const newReceivePageState = new ReceivePageState(newAddress, newType);
      newReceivePageState.rerenderKey = newRerenderKey;

      this.setState({ receivePageState: newReceivePageState });
    });
  };

  doRefresh = () => {
    this.rpc.refresh(false);
  };

  clearTimers = () => {
    this.rpc.clearTimers();
  };

  shieldAllBalanceToOrchard = async (): Promise<string> => {
    const result: string = await this.rpc.shieldAllBalanceToOrchard();
    return result;
  }

  shieldSaplingBalanceToOrchard = async (): Promise<string> => {
    const result: string = await this.rpc.shieldSaplingBalanceToOrchard();
    return result;
  }

  shieldTransparentBalanceToOrchard = async (): Promise<string> => {
    const result: string = await this.rpc.shieldTransparentBalanceToOrchard();
    return result;
  }

  navigateToLoadingScreen = () => {
    this.props.history.push(routes.LOADING);
  };

  render() {
    const standardProps = {
      openErrorModal: this.openErrorModal,
      closeErrorModal: this.closeErrorModal,
      setSendTo: this.setSendTo,
      openPasswordAndUnlockIfNeeded: this.openPasswordAndUnlockIfNeeded,
    };

    //console.log(this.props.location);

    return (
      <ContextAppProvider value={this.state}>
        <ErrorModal closeModal={this.closeErrorModal} />

        <PasswordModal />

        <ServerSelectModal
          closeModal={this.closeServerSelectModal}
          openErrorModal={this.openErrorModal}
        />

        <div style={{ overflow: "hidden" }}>
          {this.props.location.pathname !== "/" && (
            <div className={cstyles.sidebarcontainer}>
              <Sidebar
                setInfo={this.setInfo}
                setRescanning={this.setRescanning}
                getPrivKeyAsString={this.getPrivKeyAsString}
                importPrivKeys={this.importPrivKeys}
                lockWallet={this.lockWallet}
                encryptWallet={this.encryptWallet}
                decryptWallet={this.decryptWallet}
                openPassword={this.openPassword}
                clearTimers={this.clearTimers}
                updateWalletSettings={this.updateWalletSettings}
                logo={Logo}
                {...standardProps}
              />
            </div>
          )}

          <div className={cstyles.contentcontainer}>
            <Switch>
              <Route
                path={routes.SEND}
                render={() => (
                  <Send
                    sendTransaction={this.sendTransaction}
                    setSendPageState={this.setSendPageState}
                    {...standardProps}
                  />
                )}
              />
              <Route
                path={routes.RECEIVE}
                render={() => (
                  <Receive
                    {...standardProps}
                    shieldTransparentBalanceToOrchard={this.shieldTransparentBalanceToOrchard}
                    shieldSaplingBalanceToOrchard={this.shieldSaplingBalanceToOrchard}
                    fetchAndSetSinglePrivKey={this.fetchAndSetSinglePrivKey}
                    fetchAndSetSingleViewKey={this.fetchAndSetSingleViewKey}
                  />
                )}
              />
              <Route
                path={routes.ADDRESSBOOK}
                render={() => (
                  <AddressBook
                    addAddressBookEntry={this.addAddressBookEntry}
                    removeAddressBookEntry={this.removeAddressBookEntry}
                    {...standardProps}
                  />
                )}
              />
              <Route
                path={routes.DASHBOARD}
                render={() => (
                  <Dashboard 
                    shieldAllBalanceToOrchard={this.shieldAllBalanceToOrchard} 
                    openErrorModal={this.openErrorModal} 
                  />
                )}
              />
              <Route
                path={routes.TRANSACTIONS}
                render={() => (
                  <Transactions
                    setSendTo={this.setSendTo}
                  />
                )}
              />

              <Route
                path={routes.ZCASHD}
                render={() => (
                  <Zcashd
                    refresh={this.doRefresh}
                    openServerSelectModal={this.openServerSelectModal}
                  />
                )}
              />

              <Route
                path={routes.LOADING}
                render={() => (
                  <LoadingScreen
                    setRPCConfig={this.setRPCConfig}
                    setRescanning={this.setRescanning}
                    setInfo={this.setInfo}
                    openServerSelectModal={this.openServerSelectModal}
                    logo={Logo}
                    setReadOnly={this.setReadOnly}
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