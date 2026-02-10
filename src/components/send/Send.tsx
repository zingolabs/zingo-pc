import React, { useContext, useEffect, useState } from "react";
import styles from "./Send.module.css";
import cstyles from "../common/Common.module.css";
import {
  ToAddrClass,
  SendPageStateClass,
  AddressBookEntryClass,
  ValueTransferClass,
  ServerChainNameEnum,
} from "../appstate";
import Utils from "../../utils/utils";
import ScrollPaneTop from "../scrollPane/ScrollPane";
import { BalanceBlockHighlight } from "../balance_Block";
import { parseZcashURI, ZcashURITarget } from "../../utils/uris";
import SendManyJsonType from "./components/SendManyJSONType";
import ToAddrBox from "./components/ToAddrBox";
import SendConfirmModal from "./components/SendConfirmModal";
import { ContextApp } from "../../context/ContextAppState";

import native from "../../native.node";
import getSendManyJSON from "./components/getSendManyJSON";

type SendProps = {
  sendTransaction: (sendJson: SendManyJsonType[]) => Promise<string>;
  setSendPageState: (sendPageState: SendPageStateClass) => void;
};

const Send: React.FC<SendProps> = ({
  sendTransaction,
  setSendPageState,
}) => {
  const context = useContext(ContextApp);
  const {
    addressesUnified,
    sendPageState,
    info,
    totalBalance,
    readOnly,
    addressBook,
    fetchError,
    valueTransfers,
    currentWallet,
    setSendTo,
    calculateShieldFee,
    handleShieldButton,
  } = context;

  const [modalIsOpen, setModalIsOpen] = useState<boolean>(false);
  const [sendButtonEnabled, setSendButtonEnabled] = useState<boolean>(false);
  const [sendFee, setSendFee] = useState<number>(0);
  const [sendFeeError, setSendFeeError] = useState<string>('');
  const [totalAmountAvailable, setTotalAmountAvailable] = useState<number>(0);
  const [tooltip, setTooltip ] = useState<string>('');

  const [anyPending, setAnyPending] = useState<boolean>(false);
  const [shieldFee, setShieldFee] = useState<number>(0);

  useEffect(() => {
    // set somePending as well here when I know there is something new in ValueTransfers
    const pending: number =
      valueTransfers.length > 0 ? valueTransfers.filter((vt: ValueTransferClass) => vt.confirmations >= 0 && vt.confirmations < 3).length : 0;
    setAnyPending(pending > 0);
  }, [valueTransfers]);
    
  useEffect(() => {
    if (totalBalance.confirmedTransparentBalance > 0 && calculateShieldFee && !readOnly && !anyPending) {
      (async () => {
        setShieldFee(await calculateShieldFee());
      })();
    }
  }, [totalBalance.confirmedTransparentBalance, anyPending, calculateShieldFee, readOnly]); 

  useEffect(() => {
    // transparent funds are not spendable.
    let _totalAmountAvailable: number = totalBalance.totalSpendableBalance;
    _totalAmountAvailable = Number(Utils.maxPrecisionTrimmed(_totalAmountAvailable));
    if (_totalAmountAvailable < 0) {
      _totalAmountAvailable = 0;
    }
    setTotalAmountAvailable(_totalAmountAvailable);

    let _tooltip: string = "";
    // set somePending as well here when I know there is something new in ValueTransfers
    const pending: number =
      valueTransfers.length > 0 ? valueTransfers.filter((vt: ValueTransferClass) => vt.confirmations >= 0 && vt.confirmations < 3).length : 0;
    // If there are unverified funds, then show a tooltip 
    const unconfirmed: number = 
      (totalBalance.totalOrchardBalance + totalBalance.totalSaplingBalance + totalBalance.totalTransparentBalance) -
      (totalBalance.confirmedOrchardBalance + totalBalance.confirmedSaplingBalance + totalBalance.confirmedTransparentBalance);
    const { bigPart, smallPart }: {bigPart: string, smallPart: string} = 
      Utils.splitZecAmountIntoBigSmall(unconfirmed);
    
    if (unconfirmed > 0) {
      _tooltip = `Waiting for confirmation of ZEC ${bigPart + smallPart} with 3 block (approx 5 minutes)`; 
    }
    if (unconfirmed === 0 && pending > 0) {
      _tooltip = `Waiting for confirmation with 3 block (approx 5 minutes)`; 
    }
    setTooltip(_tooltip);
  }, [
    addressesUnified, 
    totalBalance.totalOrchardBalance, 
    totalBalance.totalSaplingBalance, 
    totalBalance.totalTransparentBalance, 
    totalBalance.confirmedOrchardBalance,
    totalBalance.confirmedSaplingBalance,
    totalBalance.confirmedTransparentBalance,
    totalBalance.totalSpendableBalance,
    valueTransfers,
  ]);  

  const clearToAddrs = () => {
    // Create the new state object
    const newState = new SendPageStateClass();

    setSendPageState(newState);
    setSendFee(0);
    setSendFeeError('');

    // transparent funds are not spendable.
    let _totalAmountAvailable: number = totalBalance.totalSpendableBalance;
    _totalAmountAvailable = Number(Utils.maxPrecisionTrimmed(_totalAmountAvailable));
    if (_totalAmountAvailable < 0) {
      _totalAmountAvailable = 0;
    }
    setTotalAmountAvailable(_totalAmountAvailable);
  };

  const updateToField = async (
    address: string | null,
    amount: string | null,
    memo: string | null,
  ) => {
    // Find the correct toAddr
    const toAddr: ToAddrClass = sendPageState.toaddr;
    if (address !== null) {
      // First, check if this is a URI
      const parsedUri: string | ZcashURITarget = await parseZcashURI(address.replace(/ /g, ""), currentWallet ? currentWallet.chain_name : ServerChainNameEnum.mainChainName);
      if (typeof parsedUri === "string") {
        if (!parsedUri || parsedUri.toLowerCase().startsWith('error')) {
          // with error leave the same value
          toAddr.to = address.replace(/ /g, ""); // Remove spaces 
        } else {
          // if it is string with no error, it is an address
          toAddr.to = parsedUri
        }
      } else {
        // if no string and no error extract all the infro from the URI
        setSendTo(parsedUri);
        return;
      }
    }

    if (amount !== null) {
      // Check to see the new amount if valid
      const newAmount: number = parseFloat(amount);
      if (newAmount < 0 || newAmount > 21 * 10 ** 6) {
        return;
      }
      toAddr.amount = newAmount;
    }

    if (memo !== null && toAddr) {
      toAddr.memo = memo;
    }

    // Create the new state object 
    const newState = new SendPageStateClass();
    newState.toaddr = toAddr;

    setSendPageState(newState);
  };

  const setMaxAmount = async (total: number) => {
    // Find the correct toAddr
    const toAddr: ToAddrClass = sendPageState.toaddr;

    toAddr.amount = total;
    if (toAddr.amount < 0) toAddr.amount = 0;
    toAddr.amount = Number(Utils.maxPrecisionTrimmed(toAddr.amount)); 
    
    // Create the new state object 
    const newState = new SendPageStateClass();
    newState.toaddr = toAddr;

    setSendPageState(newState);
  };

  const openModal = () => {
    setModalIsOpen(true);
  };

  const closeModal = () => {
    setModalIsOpen(false);
  };

  const getLabelAddressBook = (addr: string) => {
    // Find the addr in addresses
    const label: AddressBookEntryClass | undefined = addressBook.find((ab: AddressBookEntryClass) => ab.address === addr);
    const labelStr: string = label ? ` [ ${label.label} ]` : "";

    return labelStr; 
  };

  const calculateSendFee = async (): Promise<{fee: number, error: string, spendable: number}> => {
    let _fee: number = 0;
    let _error: string = '';
    // transparent funds are not spendable.
    let _spendable: number = totalBalance.totalSpendableBalance;
    try {
      if (sendPageState.toaddr.to) {
        const result: string = await native.get_spendable_balance_with_address(sendPageState.toaddr.to, "false");
        console.log('SPENDABLEBALANCE', result);
        if (!result || result.toLowerCase().startsWith('error')) {
          _error = result;
          _spendable = 0;
        } else {
          const resultJSON = JSON.parse(result);
          if (resultJSON.spendable_balance) {
            _spendable = resultJSON.spendable_balance / 10 ** 8;
          } else {
            _spendable = 0;
          }
        }
      }
      if (sendPageState.toaddr.amount >= 0 && sendPageState.toaddr.to && !_error) {
        const sendJson: SendManyJsonType[] = getSendManyJSON(sendPageState);
        //console.log(sendJson);
        const result: string = await native.send(JSON.stringify(sendJson));
        console.log('SEND', result);
        if (!result || result.toLowerCase().startsWith('error')) {
          _error = result;
        } else {
          const resultJSON = JSON.parse(result);
          if (resultJSON.error) {
            _error = resultJSON.error;
          } else if (resultJSON.fee) {
            _fee = resultJSON.fee / 10 ** 8;
          }
        }
      }
      _spendable = Number(Utils.maxPrecisionTrimmed(_spendable));
      if (_spendable < 0) {
        _spendable = 0;
      }
    } catch (error: any) {
      const err = `Error: Critical Error calculate send fee ${error}`;
      console.log(err);
      _error = err;
      _spendable = 0;
    }
    return {fee: _fee, error: _error, spendable: _spendable};
  };

  const fetchSendFeeAndErrorAndSpendable = async (): Promise<void> => {
    const { fee, error, spendable} = await calculateSendFee();
    console.log('AMOUNTS CALCULATION: fee', fee, 'spendable', spendable, 'error', error);
    setSendFee(fee);
    setSendFeeError(error);
    setTotalAmountAvailable(spendable);
  };

  if (readOnly) {
    return <div className={cstyles.well} style={{ textAlign: "center" }}>This is a only-watch wallet, it is imposible to spend/send the balance.</div>;
  }

  return (
    <div>
      <SendConfirmModal
        sendPageState={sendPageState}
        totalBalance={totalBalance}
        info={info}
        sendTransaction={sendTransaction}
        closeModal={closeModal}
        modalIsOpen={modalIsOpen}
        clearToAddrs={clearToAddrs}
        sendFee={sendFee}
        currencyName={info.currencyName}
      />

      <div className={[cstyles.well, styles.containermargin].join(" ")}>
        <div className={[cstyles.balancebox].join(" ")}>
          <BalanceBlockHighlight
            topLabel="All Funds"
            zecValue={totalBalance.totalOrchardBalance + totalBalance.totalSaplingBalance + totalBalance.totalTransparentBalance}
            usdValue={Utils.getZecToUsdString(info.zecPrice, totalBalance.totalOrchardBalance + totalBalance.totalSaplingBalance + totalBalance.totalTransparentBalance)}
            currencyName={info.currencyName}
          />
          <BalanceBlockHighlight
            topLabel="Spendable Funds"
            zecValue={totalAmountAvailable}
            usdValue={Utils.getZecToUsdString(info.zecPrice, totalAmountAvailable)}
            currencyName={info.currencyName}
            tooltip={tooltip}
          />
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

      <div className={[cstyles.xlarge, cstyles.marginnegativetitle, cstyles.center].join(" ")}>Send</div> 

      <div className={[styles.horizontalcontainer].join(" ")}>
        <div className={cstyles.containermarginleft}>
          <ScrollPaneTop offsetHeight={260}>
            {[sendPageState.toaddr].map((toaddr: ToAddrClass, index: number) => {
              return (
                <ToAddrBox
                  key={index}
                  toaddr={toaddr}
                  zecPrice={info.zecPrice}
                  updateToField={updateToField}
                  fromAmount={totalAmountAvailable}
                  fromAmountDefault={totalBalance.totalSpendableBalance}
                  setMaxAmount={setMaxAmount}
                  setSendButtonEnabled={setSendButtonEnabled}
                  sendFee={sendFee}
                  sendFeeError={sendFeeError}
                  fetchSendFeeAndErrorAndSpendable={fetchSendFeeAndErrorAndSpendable}
                  setSendFee={setSendFee}
                  setSendFeeError={setSendFeeError}
                  setTotalAmountAvailable={setTotalAmountAvailable}
                  label={getLabelAddressBook(toaddr.to)}
                  serverChainName={currentWallet ? currentWallet.chain_name : ServerChainNameEnum.mainChainName}
                  block={info.latestBlock >= info.walletHeight ? info.latestBlock : info.walletHeight}
                  currencyName={info.currencyName}
                />
              );
            })}
          </ScrollPaneTop>
        </div>

        <div className={cstyles.verticalbuttons}>
          <button
            type="button"
            disabled={!sendButtonEnabled}
            className={cstyles.primarybutton}
            onClick={openModal}
          >
            Send
          </button>
          <button type="button" className={cstyles.primarybutton} onClick={clearToAddrs}>
            Clear
          </button>
        </div>
      </div>
    </div>
  );
};

export default Send;
