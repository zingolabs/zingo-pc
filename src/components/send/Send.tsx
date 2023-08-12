import React, { PureComponent } from "react";
import styles from "./Send.module.css";
import cstyles from "../common/Common.module.css";
import {
  ToAddr,
  SendPageState,
  AddressBookEntry,
  SendProgress,
  Address,
  AddressType,
} from "../appstate";
import Utils from "../../utils/utils";
import ScrollPane from "../scrollPane/ScrollPane";
import { BalanceBlockHighlight } from "../balanceblock";
import { parseZcashURI, ZcashURITarget } from "../../utils/uris";
import SendManyJsonType from "./components/SendManyJSONType";
import ToAddrBox from "./components/ToAddrBox";
import ConfirmModal from "./components/ConfirmModal";
import { ContextApp } from "../../context/ContextAppState";

type OptionType = {
  value: string;
  label: string;
};

type SendProps = {
  setSendTo: (targets: ZcashURITarget[] | ZcashURITarget) => void;
  sendTransaction: (sendJson: SendManyJsonType[], setSendProgress: (p?: SendProgress) => void) => Promise<string>;
  setSendPageState: (sendPageState: SendPageState) => void;
  openErrorModal: (title: string, body: string) => void;
  openPasswordAndUnlockIfNeeded: (successCallback: () => void) => void;
};

class SendState {
  modalIsOpen: boolean;

  sendButtonEnabled: boolean;

  constructor() {
    this.modalIsOpen = false;
    this.sendButtonEnabled = false;
  }
}

export default class Send extends PureComponent<SendProps, SendState> {
  static contextType = ContextApp;
  constructor(props: SendProps) {
    super(props);

    this.state = new SendState();
  }

  /*
  addToAddr = () => {
    const { sendPageState, setSendPageState } = this.props;
    const newToAddrs = sendPageState.toaddrs.concat(new ToAddr(Utils.getNextToAddrID()));

    // Create the new state object
    const newState = new SendPageState();
    newState.fromaddr = sendPageState.fromaddr;
    newState.toaddrs = newToAddrs;

    setSendPageState(newState);
  };
  */

  clearToAddrs = () => {
    const { setSendPageState } = this.props;
    const { sendPageState } = this.context;
    const newToAddrs = [new ToAddr(Utils.getNextToAddrID())];

    // Create the new state object
    const newState = new SendPageState();
    newState.fromaddr = sendPageState.fromaddr;
    newState.toaddrs = newToAddrs;

    setSendPageState(newState);
  };

  changeFrom = (selectedOption: OptionType) => {
    const { setSendPageState } = this.props;
    const { sendPageState } = this.context;

    // Create the new state object
    const newState = new SendPageState();
    newState.fromaddr = selectedOption.value;
    newState.toaddrs = sendPageState.toaddrs;

    setSendPageState(newState);
  };

  updateToField = async (
    id: number,
    address: string | null,
    amount: string | null,
    memo: string | null,
    memoReplyTo: string | null
  ) => {
    const { setSendPageState, setSendTo } = this.props;
    const { sendPageState } = this.context;

    // Find the correct toAddr
    const toAddr = sendPageState.toaddrs.find((a: ToAddr) => a.id === id) as ToAddr;
    const restToAddr = sendPageState.toaddrs.find((a: ToAddr) => a.id !== id) as ToAddr[];
    if (address !== null) {
      // First, check if this is a URI
      // $FlowFixMe
      const parsedUri = await parseZcashURI(address); 
      if (Array.isArray(parsedUri)) {
        setSendTo(parsedUri);
        return;
      }

      toAddr.to = address.replace(/ /g, ""); // Remove spaces 
    }

    if (amount !== null) {
      // Check to see the new amount if valid
      // $FlowFixMe
      const newAmount = parseFloat(amount);
      if (newAmount < 0 || newAmount > 21 * 10 ** 6) {
        return;
      }
      // $FlowFixMe
      toAddr.amount = newAmount;
    }

    if (memo !== null) {
      if (typeof memo === "string") {
        toAddr.memo = memo;
      } else {
        // $FlowFixMe
        toAddr.memo = memo;
      }
    }

    if (memoReplyTo != null) {
      toAddr.memoReplyTo = memoReplyTo;
    }

    // Create the new state object 
    const newState = new SendPageState();
    newState.fromaddr = sendPageState.fromaddr;
    if (restToAddr && restToAddr.length > 0) {
      newState.toaddrs = [toAddr, ...restToAddr];
    } else {
      newState.toaddrs = [toAddr];
    }

    setSendPageState(newState);
  };

  setMaxAmount = async (id: number, total: number) => {
    const { setSendPageState } = this.props;
    const { sendPageState, info } = this.context;

    const newToAddrs = sendPageState.toaddrs.slice(0);

    let totalOtherAmount: number = newToAddrs.filter((a: ToAddr) => a.id !== id).reduce((s: number, a: ToAddr) => s + a.amount, 0);

    // Add Fee
    totalOtherAmount += info.defaultFee;

    // Find the correct toAddr
    const toAddr = newToAddrs.find((a: ToAddr) => a.id === id) as ToAddr;
    toAddr.amount = total - totalOtherAmount;
    if (toAddr.amount < 0) toAddr.amount = 0;
    toAddr.amount = Number(Utils.maxPrecisionTrimmed(toAddr.amount)); 

    // Create the new state object
    const newState = new SendPageState();
    newState.fromaddr = sendPageState.fromaddr;
    newState.toaddrs = newToAddrs;

    setSendPageState(newState);
  };

  setSendButtonEnable = (sendButtonEnabled: boolean) => {
    this.setState({ sendButtonEnabled });
  };

  openModal = () => {
    this.setState({ modalIsOpen: true });
  };

  closeModal = () => {
    this.setState({ modalIsOpen: false });
  };

  getBalanceForAddress = (addr: string, addresses: Address[]): number => {
    // Find the addr in addresses
    const address = addresses.find((ab) => ab.address === addr) as Address;

    if (!address) {
      return 0;
    }

    return address.balance;
  };

  getLabelForFromAddress = (addr: string, addresses: Address[], currencyName: string) => {
    // Find the addr in addresses
    const { addressBook } = this.context;
    const label = addressBook.find((ab: AddressBookEntry) => ab.address === addr);
    const labelStr = label ? ` [ ${label.label} ]` : "";

    const balance = this.getBalanceForAddress(addr, addresses);

    return `[ ${currencyName} ${balance.toString()} ]${labelStr} ${addr}`;
  };

  render() {
    const { modalIsOpen, sendButtonEnabled } = this.state;
    const {
      sendTransaction,
      openErrorModal,
      openPasswordAndUnlockIfNeeded,
    } = this.props;
    const {
      addresses,
      sendPageState,
      info,
      totalBalance,
    } = this.context;

    const totalAmountAvailable = totalBalance.transparent + totalBalance.spendableZ + totalBalance.uabalance;
    const fromaddr = addresses.find((a: Address) => a.type === AddressType.unified)?.address || ""; 

    // If there are unverified funds, then show a tooltip
    let tooltip: string = "";
    if (totalBalance.unverifiedZ) {
      tooltip = `Waiting for confirmation of ZEC ${totalBalance.unverifiedZ} with 5 blocks (approx 6 minutes)`; 
    }

    return (
      <div>
        <ConfirmModal
            sendPageState={sendPageState}
            totalBalance={totalBalance}
            info={info}
            sendTransaction={sendTransaction}
            openErrorModal={openErrorModal}
            closeModal={this.closeModal}
            modalIsOpen={modalIsOpen}
            clearToAddrs={this.clearToAddrs}
            openPasswordAndUnlockIfNeeded={openPasswordAndUnlockIfNeeded}
        />

        <div className={[cstyles.well, cstyles.balancebox, styles.containermargin].join(" ")}>
          <BalanceBlockHighlight
            topLabel="Spendable Funds"
            zecValue={totalAmountAvailable}
            usdValue={Utils.getZecToUsdString(info.zecPrice, totalAmountAvailable)}
            currencyName={info.currencyName}
            tooltip={tooltip}
          />
          <BalanceBlockHighlight
            topLabel="All Funds"
            zecValue={totalBalance.total}
            usdValue={Utils.getZecToUsdString(info.zecPrice, totalBalance.total)}
            currencyName={info.currencyName}
          />
        </div>

        <div className={[cstyles.xlarge, cstyles.marginnegativetitle, cstyles.center].join(" ")}>Send</div> 

        <div className={[styles.horizontalcontainer].join(" ")}>
          <div className={cstyles.containermarginleft}>
            <ScrollPane offsetHeight={220}>
              {sendPageState.toaddrs.map((toaddr: ToAddr) => {
                return (
                  <ToAddrBox
                    key={toaddr.id}
                    toaddr={toaddr}
                    zecPrice={info.zecPrice}
                    updateToField={this.updateToField}
                    fromAddress={fromaddr}
                    fromAmount={totalAmountAvailable}
                    setMaxAmount={this.setMaxAmount}
                    setSendButtonEnable={this.setSendButtonEnable}
                    totalAmountAvailable={totalAmountAvailable}
                  />
                );
              })}
              {/*<div style={{ textAlign: "right" }}>
                <button type="button" onClick={this.addToAddr}>
                  <i className={["fas", "fa-plus"].join(" ")} />
                </button> 
              </div>*/}
            </ScrollPane>
          </div>

          <div className={cstyles.verticalbuttons}>
            <button
              type="button"
              disabled={!sendButtonEnabled}
              className={cstyles.primarybutton}
              onClick={this.openModal}
            >
              Send
            </button>
            <button type="button" className={cstyles.primarybutton} onClick={this.clearToAddrs}>
              Clear
            </button>
          </div>
        </div>
      </div>
    );
  }
}
