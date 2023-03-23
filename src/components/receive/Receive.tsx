import React, { Component } from "react";
import { Tab, Tabs, TabList, TabPanel } from "react-tabs";
import {
  Accordion,
} from "react-accessible-accordion";
import styles from "./Receive.module.css";
//import cstyles from "../common/Common.module.css";
import Utils from "../../utils/utils";
import { AddressBalance, Info, ReceivePageState, AddressBookEntry, AddressDetail, AddressType } from "../appstate";
import ScrollPane from "../scrollPane/ScrollPane";
import AddressBlock from "./components/AddressBlock";

type ReceiveProps = {
  addresses: AddressDetail[];
  addressesWithBalance: AddressBalance[];
  addressBook: AddressBookEntry[];
  info: Info;
  addressPrivateKeys: Map<string, string>;
  addressViewKeys: Map<string, string>;
  receivePageState: ReceivePageState;
  fetchAndSetSinglePrivKey: (k: string) => void;
  fetchAndSetSingleViewKey: (k: string) => void;
  createNewAddress: (t: AddressType) => void;
  rerenderKey: number;
};

export default class Receive extends Component<ReceiveProps> {
  render() {
    const {
      addresses,
      addressesWithBalance,
      addressPrivateKeys,
      addressViewKeys,
      addressBook,
      info,
      receivePageState,
      fetchAndSetSinglePrivKey,
      fetchAndSetSingleViewKey,
      //createNewAddress,
      rerenderKey,
    } = this.props;

    // Convert the addressBalances into a map.
    const addressMap: Map<string, number> = addressesWithBalance.reduce((m, a) => {
      m.set(a.address, a.balance);
      return m;
    }, new Map());

    const uaddrs = addresses
      .filter((a) => a.type === AddressType.unified)
      .slice(0, 100)
      .map((a) => {
        let uaddr = new AddressBalance(a.address, addressMap.get(a.address) || 0)
        uaddr.receivers = a.receivers;
        return uaddr;
      });
    let defaultUaddr = uaddrs.length ? uaddrs[0].address : "";
    if (receivePageState && Utils.isUnified(receivePageState.newAddress)) {
      defaultUaddr = receivePageState.newAddress;

      // move this address to the front, since the scrollbar will reset when we re-render
      uaddrs.sort((x, y) => {
        return x.address === defaultUaddr ? -1 : y.address === defaultUaddr ? 1 : 0;
      });
    }

    const zaddrs = addresses
      .filter((a) => Utils.isSapling(a.address))
      .slice(0, 100)
      .map((a) => new AddressBalance(a.address, addressMap.get(a.address) || 0));

    let defaultZaddr = zaddrs.length ? zaddrs[0].address : "";
    if (receivePageState && Utils.isSapling(receivePageState.newAddress)) {
      defaultZaddr = receivePageState.newAddress;

      // move this address to the front, since the scrollbar will reset when we re-render
      zaddrs.sort((x, y) => {
        return x.address === defaultZaddr ? -1 : y.address === defaultZaddr ? 1 : 0;
      });
    }

    const taddrs = addresses
      .filter((a) => Utils.isTransparent(a.address))
      .slice(0, 100)
      .map((a) => new AddressBalance(a.address, addressMap.get(a.address) || 0));

    let defaultTaddr = taddrs.length ? taddrs[0].address : "";
    if (receivePageState && Utils.isTransparent(receivePageState.newAddress)) {
      defaultTaddr = receivePageState.newAddress;

      // move this address to the front, since the scrollbar will reset when we re-render
      taddrs.sort((x, y) => {
        return x.address === defaultTaddr ? -1 : y.address === defaultTaddr ? 1 : 0;
      });
    }

    const addressBookMap = addressBook.reduce((m, obj) => {
      m.set(obj.address, obj.label);
      return m;
    }, new Map());

    return (
      <div>
        <div className={styles.receivecontainer}>
          <Tabs>
            <TabList>
              <Tab>Unified</Tab>
              <Tab>Shielded</Tab>
              <Tab>Transparent</Tab>
            </TabList>

            <TabPanel key={`ua${rerenderKey}`}>
              <ScrollPane offsetHeight={100}>
                <Accordion preExpanded={[defaultUaddr]}>
                  {uaddrs.map((a) => (
                    <AddressBlock
                      key={a.address}
                      addressBalance={a}
                      currencyName={info.currencyName}
                      label={addressBookMap.get(a.address)}
                      receivers={a.receivers}
                      zecPrice={info.zecPrice}
                      privateKey={addressPrivateKeys.get(a.address)}
                      viewKey={addressViewKeys.get(a.address)}
                      fetchAndSetSinglePrivKey={fetchAndSetSinglePrivKey}
                      fetchAndSetSingleViewKey={fetchAndSetSingleViewKey}
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
                  {zaddrs.map((a) => (
                    <AddressBlock
                      key={a.address}
                      addressBalance={a}
                      currencyName={info.currencyName}
                      label={addressBookMap.get(a.address)}
                      zecPrice={info.zecPrice}
                      privateKey={addressPrivateKeys.get(a.address)}
                      viewKey={addressViewKeys.get(a.address)}
                      fetchAndSetSinglePrivKey={fetchAndSetSinglePrivKey}
                      fetchAndSetSingleViewKey={fetchAndSetSingleViewKey}
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
                  {taddrs.map((a) => (
                    <AddressBlock
                      key={a.address}
                      addressBalance={a}
                      currencyName={info.currencyName}
                      zecPrice={info.zecPrice}
                      privateKey={addressPrivateKeys.get(a.address)}
                      viewKey={addressViewKeys.get(a.address)}
                      fetchAndSetSinglePrivKey={fetchAndSetSinglePrivKey}
                      fetchAndSetSingleViewKey={fetchAndSetSingleViewKey}
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
