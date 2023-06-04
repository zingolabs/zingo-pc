import React, { Component } from "react";
import { Tab, Tabs, TabList, TabPanel } from "react-tabs";
import {
  Accordion,
} from "react-accessible-accordion";
import styles from "./Receive.module.css";
import { AddressBookEntry, Address, AddressType } from "../appstate";
import ScrollPane from "../scrollPane/ScrollPane";
import AddressBlock from "./components/AddressBlock";
import { ContextApp } from "../../context/ContextAppState";

type ReceiveProps = {
  fetchAndSetSinglePrivKey: (k: string) => void;
  fetchAndSetSingleViewKey: (k: string) => void;
  //createNewAddress: (t: AddressType) => void;
  shieldBalanceToOrchard: () => void;
};

export default class Receive extends Component<ReceiveProps> {
  static contextType = ContextApp;
  render() {
    const {
      fetchAndSetSinglePrivKey,
      fetchAndSetSingleViewKey,
      //createNewAddress,
      shieldBalanceToOrchard
    } = this.props;
    const {
      addresses,
      addressPrivateKeys,
      addressViewKeys,
      addressBook,
      info,
      receivePageState,
      rerenderKey,
    } = this.context;

    const uaddrs = addresses
      .filter((a: Address) => a.type === AddressType.unified);
    let defaultUaddr = uaddrs.length > 0 ? uaddrs[0].address : "";
    if (receivePageState && receivePageState.newType === AddressType.unified) {
      defaultUaddr = receivePageState.newAddress;

      // move this address to the front, since the scrollbar will reset when we re-render
      uaddrs.sort((x: Address, y: Address) => {
        return x.address === defaultUaddr ? -1 : y.address === defaultUaddr ? 1 : 0;
      });
    }

    const zaddrs = addresses
      .filter((a: Address) => a.type === AddressType.sapling);
    let defaultZaddr = zaddrs.length > 0 ? zaddrs[0].address : "";
    if (receivePageState && receivePageState.newType === AddressType.sapling) {
      defaultZaddr = receivePageState.newAddress;

      // move this address to the front, since the scrollbar will reset when we re-render
      zaddrs.sort((x: Address, y: Address) => {
        return x.address === defaultZaddr ? -1 : y.address === defaultZaddr ? 1 : 0;
      });
    }

    const taddrs = addresses
      .filter((a: Address) => a.type === AddressType.transparent);
    let defaultTaddr = taddrs.length > 0 ? taddrs[0].address : "";
    if (receivePageState && receivePageState.newType === AddressType.transparent) {
      defaultTaddr = receivePageState.newAddress;

      // move this address to the front, since the scrollbar will reset when we re-render
      taddrs.sort((x: Address, y: Address) => {
        return x.address === defaultTaddr ? -1 : y.address === defaultTaddr ? 1 : 0;
      });
    }

    const addressBookMap = addressBook.reduce((m: Map<string, string>, obj: AddressBookEntry) => {
      m.set(obj.address, obj.label);
      return m;
    }, new Map());

    return (
      <div>
        <div className={styles.receivecontainer}>
          <Tabs>
            <TabList>
              <Tab>Unified</Tab>
              <Tab>Sapling</Tab>
              <Tab>Transparent</Tab>
            </TabList>

            <TabPanel key={`ua${rerenderKey}`}>
              <ScrollPane offsetHeight={100}>
                <Accordion preExpanded={[defaultUaddr]}>
                  {uaddrs.map((a: Address) => (
                    <AddressBlock
                      key={a.address}
                      address={a}
                      currencyName={info.currencyName}
                      label={addressBookMap.get(a.address)}
                      zecPrice={info.zecPrice}
                      privateKey={addressPrivateKeys.get(a.address)}
                      viewKey={addressViewKeys.get(a.address)}
                      fetchAndSetSinglePrivKey={fetchAndSetSinglePrivKey}
                      fetchAndSetSingleViewKey={fetchAndSetSingleViewKey}
                      shieldBalanceToOrchard={shieldBalanceToOrchard}
                    />
                  ))}
                </Accordion>

                {/*<button
                  className={[cstyles.primarybutton, cstyles.margintoplarge, cstyles.marginbottomlarge].join(" ")}
                  onClick={() => createNewAddress(AddressType.unified)}
                  type="button"
                >
                  New Unified Address
                </button>*/}
              </ScrollPane>
            </TabPanel>

            <TabPanel key={`z${rerenderKey}`}>
              {/* Change the hardcoded height */}
              <ScrollPane offsetHeight={100}>
                <Accordion preExpanded={[defaultZaddr]}>
                  {zaddrs.map((a: Address) => (
                    <AddressBlock
                      key={a.address}
                      address={a}
                      currencyName={info.currencyName}
                      label={addressBookMap.get(a.address)}
                      zecPrice={info.zecPrice}
                      privateKey={addressPrivateKeys.get(a.address)}
                      viewKey={addressViewKeys.get(a.address)}
                      fetchAndSetSinglePrivKey={fetchAndSetSinglePrivKey}
                      fetchAndSetSingleViewKey={fetchAndSetSingleViewKey}
                      shieldBalanceToOrchard={shieldBalanceToOrchard}
                    />
                  ))}
                </Accordion>

                {/*<button
                  className={[cstyles.primarybutton, cstyles.margintoplarge, cstyles.marginbottomlarge].join(" ")}
                  onClick={() => createNewAddress(AddressType.sapling)}
                  type="button"
                >
                  New Sapling Address
                </button>*/}
              </ScrollPane>
            </TabPanel>

            <TabPanel key={`t${rerenderKey}`}>
              {/* Change the hardcoded height */}
              <ScrollPane offsetHeight={100}>
                <Accordion preExpanded={[defaultTaddr]}>
                  {taddrs.map((a: Address) => (
                    <AddressBlock
                      key={a.address}
                      address={a}
                      currencyName={info.currencyName}
                      zecPrice={info.zecPrice}
                      privateKey={addressPrivateKeys.get(a.address)}
                      viewKey={addressViewKeys.get(a.address)}
                      fetchAndSetSinglePrivKey={fetchAndSetSinglePrivKey}
                      fetchAndSetSingleViewKey={fetchAndSetSingleViewKey}
                      shieldBalanceToOrchard={shieldBalanceToOrchard}
                    />
                  ))}
                </Accordion>

                {/*<button
                  className={[cstyles.primarybutton, cstyles.margintoplarge, cstyles.marginbottomlarge].join(" ")}
                  type="button"
                  onClick={() => createNewAddress(AddressType.transparent)}
                >
                  New Transparent Address
                </button>*/}
              </ScrollPane>
            </TabPanel>
          </Tabs>
        </div>
      </div>
    );
  }
}
