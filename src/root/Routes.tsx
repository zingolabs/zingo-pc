import React from "react";
import ReactModal from "react-modal";
import { Switch, Route, withRouter, RouteComponentProps } from "react-router";
import { isEqual } from 'lodash';
import { ErrorModal, ErrorModalData } from "../components/errormodal";
import cstyles from "../components/common/Common.module.css";
import routes from "../constants/routes.json"; 
import { Dashboard } from "../components/dashboard";
import { Insight } from "../components/insight";
import { Send, SendManyJsonType } from "../components/send";
import { Receive } from "../components/receive";
import { LoadingScreen } from "../components/loadingscreen";
import {
  AppState,
  TotalBalanceClass,
  ValueTransferClass,
  SendPageStateClass,
  ToAddrClass,
  InfoClass,
  AddressBookEntryClass,
  ServerSelectStateClass,
  ServerClass,
  FetchErrorTypeClass,
  UnifiedAddressClass,
  TransparentAddressClass,
} from "../components/appstate";
import RPC from "../rpc/rpc";
import Utils from "../utils/utils";
import { ZcashURITarget } from "../utils/uris";
import { Zcashd } from "../components/zcashd";
import { AddressBook, AddressbookImpl } from "../components/addressbook";
import { Sidebar } from "../components/sidebar";
import { History } from "../components/history";
import { ServerSelectModal } from "../components/serverselectmodal";
import { ContextAppProvider, defaultAppState } from "../context/ContextAppState";

import native from "../native.node";
import { Messages } from "../components/messages";
import serverUrisList from "../utils/serverUrisList";
const { ipcRenderer } = window.require("electron");

type Props = {};

class Routes extends React.Component<Props & RouteComponentProps, AppState> {
  rpc: RPC;

  constructor(props: Props & RouteComponentProps) {
    super(props);

    this.state = defaultAppState;

    // Create the initial ToAddr box
    this.state.sendPageState.toaddrs = [new ToAddrClass(Utils.getNextToAddrID())];

    // Set the Modal's app element
    ReactModal.setAppElement("#root");

    const servers: ServerClass[] = this.state.serverUris.length > 0 ? this.state.serverUris : serverUrisList().filter((s: ServerClass) => s.obsolete === false);
    const settings = ipcRenderer.invoke("loadSettings");
    const server: ServerClass = {uri: settings?.serveruri || servers[0].uri, chain_name: settings?.chain_name || servers[0].chain_name} as ServerClass;

    this.rpc = new RPC(
      this.setTotalBalance,
      this.setAddressesUnified,
      this.setAddressesTransparent,
      this.setValueTransferList,
      this.setMessagesList,
      this.setInfo,
      this.setZecPrice,
      this.setVerificationProgress,
      this.setFetchError,
      server,
    );
  };

  componentDidMount = async () => {
    // Read the address book
    (async () => {
      const addressBook: AddressBookEntryClass[] = await AddressbookImpl.readAddressBook();
      if (addressBook && addressBook.length > 0) {
        this.setState({ addressBook });
      }
    })();
  };

  componentWillUnmount = () => {};

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
    const serverSelectState = new ServerSelectStateClass();
    serverSelectState.modalIsOpen = true;

    this.setState({ serverSelectState });
  };

  closeServerSelectModal = () => {
    const serverSelectState = new ServerSelectStateClass();
    serverSelectState.modalIsOpen = false;

    this.setState({ serverSelectState });
  };

  setTotalBalance = (totalBalance: TotalBalanceClass) => {
    if (!isEqual(totalBalance, this.state.totalBalance)) {
      console.log('=============== total balance', totalBalance);
      this.setState({ totalBalance });
    }
  };

  setFetchError = (command: string, error: string) => {
    console.log('=============== fetch error', command, error);
    this.setState({ fetchError: {
      command,
      error,
    } });
    setTimeout(() => {
      this.setState({ fetchError: {} as FetchErrorTypeClass })
    }, 5000);
  };

  setAddressesUnified = (addressesUnified: UnifiedAddressClass[]) => {
    if (!isEqual(addressesUnified, this.state.addressesUnified)) {
      console.log('=============== addresses UA', addressesUnified.length);
      this.setState({ addressesUnified });
    }

    const { sendPageState } = this.state;
    // If there is no 'from' address, we'll set a default one
    if (!sendPageState.fromaddr) {
      // Find a u-address with the highest balance
      const defaultAB: UnifiedAddressClass | null = addressesUnified[addressesUnified.length - 1];

      if (defaultAB) {
        const newSendPageState = new SendPageStateClass();
        newSendPageState.fromaddr = defaultAB.encoded_address;
        newSendPageState.toaddrs = sendPageState.toaddrs;

        console.log('=============== default fromaddr UA', defaultAB.encoded_address);

        this.setState({ sendPageState: newSendPageState });
      }
    }
  };

  setAddressesTransparent = (addressesTransparent: TransparentAddressClass[]) => {
    if (!isEqual(addressesTransparent, this.state.addressesTransparent)) {
      console.log('=============== addresses T', addressesTransparent.length);
      this.setState({ addressesTransparent });
    }
  };

  setValueTransferList = (valueTransfers: ValueTransferClass[]) => {
    if (!isEqual(valueTransfers, this.state.valueTransfers)) {
      console.log('=============== ValueTransfer list', valueTransfers);
      this.setState({ valueTransfers });
    }
  };

  setMessagesList = (messages: ValueTransferClass[]) => {
    if (!isEqual(messages, this.state.messages)) {
      console.log('=============== ValueTransfer Messages list', messages);
      this.setState({ messages });
    }
  };

  setSendPageState = (sendPageState: SendPageStateClass) => {
    console.log('=============== send page state', sendPageState);
    this.setState({ sendPageState });
  };

  setSendTo = (targets: ZcashURITarget[] | ZcashURITarget): void => {
    console.log('=============== send to', targets);
    // Clear the existing send page state and set up the new one
    const { sendPageState } = this.state;

    const newSendPageState = new SendPageStateClass();
    newSendPageState.toaddrs = [];
    newSendPageState.fromaddr = sendPageState.fromaddr;

    // If a single object is passed, accept that as well. 
    let tgts: ZcashURITarget | ZcashURITarget[] = targets;
    if (!Array.isArray(tgts)) {
      tgts = [targets as ZcashURITarget];
    }

    tgts.forEach((tgt) => {
      const to = new ToAddrClass(Utils.getNextToAddrID());
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

  runRPCConfigure = () => {
    console.log('=============== rpc configure');
    
    this.rpc.configure();
  };

  setZecPrice = (price?: number) => {
    console.log('=============== price', price);
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
      console.log('=============== info', newInfo);
      // If the price is not set in this object, copy it over from the current object 
      const { info } = this.state;
      if (!newInfo.zecPrice) {
        newInfo.zecPrice = info.zecPrice;
      }

      this.setState({ info: newInfo });
    }
  };

  setVerificationProgress = (verificationProgress: number | null) => {
    if (verificationProgress !== this.state.verificationProgress) {
      this.setState({ verificationProgress });
    }
  };

  sendTransaction = async (sendJson: SendManyJsonType[]): Promise<string> => {
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
    // Add an entry into the address book
    const { addressBook } = this.state;
    const newAddressBook: AddressBookEntryClass[] = addressBook.concat(new AddressBookEntryClass(label, address));

    // Write to disk. This method is async
    AddressbookImpl.writeAddressBook(newAddressBook);

    this.setState({ addressBook: newAddressBook });
  };

  removeAddressBookEntry = (label: string): void => {
    const { addressBook } = this.state;
    const newAddressBook: AddressBookEntryClass[] = addressBook.filter((i) => i.label !== label);

    // Write to disk. This method is async
    AddressbookImpl.writeAddressBook(newAddressBook);

    this.setState({ addressBook: newAddressBook });
  };

  doRefresh = () => {
    this.rpc.refreshSync(false);
  };

  clearTimers = () => {
    this.rpc.clearTimers();
  };

  calculateShieldFee = async (): Promise<number> => {
    const result: string = await native.shield();
    console.log(result);
    if (!result || result.toLowerCase().startsWith('error')) {
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
  }

  shieldTransparentBalanceToOrchard = async (): Promise<string> => {
    const result: string = await this.rpc.shieldTransparentBalanceToOrchard();
    return result;
  }

  handleShieldButton = () => {
    // This will be replaced by either a success TXID or error message that the user
    // has to close manually.
    this.openErrorModal("Computing Transaction", "Please wait...This could take a while");

    setTimeout(async () => {
      try {
        const txidsResult: string = await this.shieldTransparentBalanceToOrchard();

        if (!txidsResult || txidsResult.toLocaleLowerCase().startsWith('error')) {
          this.openErrorModal("Error Shielding Transaction", `${txidsResult}`);
          return;  
        } else {
          const txids: string[] = txidsResult.split(', ');
          this.openErrorModal(
            "Successfully Broadcast Transaction",
            <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', marginRight: 10 }}>
                <div>{(txids.length === 1 ? 'Transaction was' : 'Transactions were') + ' successfully broadcast.'}</div>
                <div>{`TXID: ${txids[0]}`}</div>
                {txids.length > 1 && (
                  <div>{`TXID: ${txids[1]}`}</div>
                )}
                {txids.length > 2 && (
                  <div>{`TXID: ${txids[2]}`}</div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                <div className={cstyles.primarybutton} onClick={() => Utils.openTxid(txids[0], this.state.info.currencyName)}>
                  View TXID &nbsp;
                  <i className={["fas", "fa-external-link-square-alt"].join(" ")} />
                </div>
                {txids.length > 1 && (
                  <div style={{ marginTop: 5 }} className={cstyles.primarybutton} onClick={() => Utils.openTxid(txids[1], this.state.info.currencyName)}>
                    View TXID &nbsp;
                    <i className={["fas", "fa-external-link-square-alt"].join(" ")} />
                  </div>
                )}
                {txids.length > 2 && (
                  <div style={{ marginTop: 5 }} className={cstyles.primarybutton} onClick={() => Utils.openTxid(txids[2], this.state.info.currencyName)}>
                    View TXID &nbsp;
                    <i className={["fas", "fa-external-link-square-alt"].join(" ")} />
                  </div>
                )}
              </div>
            </div>
          );
        }
      } catch (err) {
        // If there was an error, show the error modal 
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

  navigateToLoadingScreen = (currentStatusIsError: boolean, currentStatus: string, serverUris: ServerClass[]) => {
    this.props.history.replace({
      pathname: routes.LOADING, 
      state: { 
        currentStatusIsError,
        currentStatus,
        serverUris,
      },
    });
  };

  render() {
    const standardProps = {
      openErrorModal: this.openErrorModal,
      closeErrorModal: this.closeErrorModal,
      setSendTo: this.setSendTo,
    };

    return (
      <ContextAppProvider value={this.state}>
        <ErrorModal closeModal={this.closeErrorModal} />

        <ServerSelectModal
          closeModal={this.closeServerSelectModal}
          openErrorModal={this.openErrorModal}
        />

        <div style={{ overflow: "hidden" }}>
          {this.props.location.pathname !== "/" && !this.props.location.pathname.toLowerCase().includes("zingo") && (
            <div className={cstyles.sidebarcontainer}>
              <Sidebar
                setInfo={this.setInfo}
                clearTimers={this.clearTimers}
                navigateToLoadingScreen={this.navigateToLoadingScreen}
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
                    calculateShieldFee={this.calculateShieldFee}
                    handleShieldButton={this.handleShieldButton}
                    {...standardProps}
                  />
                )}
              />
              <Route
                path={routes.RECEIVE}
                render={() => (
                  <Receive
                    calculateShieldFee={this.calculateShieldFee}
                    handleShieldButton={this.handleShieldButton}
                    {...standardProps}
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
                    calculateShieldFee={this.calculateShieldFee}
                    handleShieldButton={this.handleShieldButton}
                  />
                )}
              />
              <Route
                path={routes.INSIGHT}
                render={() => (
                  <Insight />
                )}
              />
              <Route
                path={routes.HISTORY}
                render={() => (
                  <History
                    calculateShieldFee={this.calculateShieldFee}
                    handleShieldButton={this.handleShieldButton}
                    {...standardProps}
                  />
                )}
              />
              <Route
                path={routes.MESSAGES}
                render={() => (
                  <Messages
                    calculateShieldFee={this.calculateShieldFee}
                    handleShieldButton={this.handleShieldButton}
                    {...standardProps}
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
                    runRPCConfigure={this.runRPCConfigure}
                    setInfo={this.setInfo}
                    openServerSelectModal={this.openServerSelectModal}
                    setReadOnly={this.setReadOnly}
                    setServerUris={this.setServerUris}
                    navigateToDashboard={this.navigateToDashboard}
                    {...standardProps}
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