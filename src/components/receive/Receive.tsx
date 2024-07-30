import React, { useContext, useEffect, useState } from "react";
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
  shieldTransparentBalanceToOrchard: () => Promise<string>;
  calculateShieldFee: () => Promise<number>;
  openErrorModal: (title: string, body: string | JSX.Element) => void;
};

const Receive: React.FC<ReceiveProps> = ({ fetchAndSetSinglePrivKey, fetchAndSetSingleViewKey, shieldTransparentBalanceToOrchard, calculateShieldFee, openErrorModal }) => {
  const context = useContext(ContextApp);
  const {
    addresses,
    addressPrivateKeys,
    addressViewKeys,
    addressBook,
    info,
    receivePageState,
  } = context;
  const { rerenderKey } = receivePageState;

  const [uaddrs, setUaddrs] = useState<Address[]>([]);
  const [defaultUaddr, setDefaultUaddr] = useState<string>('')
  const [zaddrs, setZaddrs] = useState<Address[]>([]);
  const [defaultZaddr, setDefaultZaddr] = useState<string>('')
  const [taddrs, setTaddrs] = useState<Address[]>([]);
  const [defaultTaddr, setDefaultTaddr] = useState<string>('')
  const [addressBookMap, setAddressBookMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const _uaddrs: Address[] = addresses
      .filter((a: Address) => a.type === AddressType.unified);
    let _defaultUaddr: string = _uaddrs.length > 0 ? _uaddrs[0].address : "";
    if (receivePageState && receivePageState.newType === AddressType.unified) {
      _defaultUaddr = receivePageState.newAddress;

      // move this address to the front, since the scrollbar will reset when we re-render
      _uaddrs.sort((x: Address, y: Address) => {
        return x.address === _defaultUaddr ? -1 : y.address === _defaultUaddr ? 1 : 0;
      });
    }
    setUaddrs(_uaddrs);
    setDefaultUaddr(_defaultUaddr);
  }, [addresses, receivePageState]);
  
  useEffect(() => {
    const _zaddrs: Address[] = addresses
      .filter((a: Address) => a.type === AddressType.sapling);
    let _defaultZaddr: string = _zaddrs.length > 0 ? _zaddrs[0].address : "";
    if (receivePageState && receivePageState.newType === AddressType.sapling) {
      _defaultZaddr = receivePageState.newAddress;

      // move this address to the front, since the scrollbar will reset when we re-render
      _zaddrs.sort((x: Address, y: Address) => {
        return x.address === _defaultZaddr ? -1 : y.address === _defaultZaddr ? 1 : 0;
      });
    }
    setZaddrs(_zaddrs);
    setDefaultZaddr(_defaultZaddr);
  }, [addresses, receivePageState]);

  useEffect(() => {
    const _taddrs: Address[] = addresses
      .filter((a: Address) => a.type === AddressType.transparent);
    let _defaultTaddr: string = _taddrs.length > 0 ? _taddrs[0].address : "";
    if (receivePageState && receivePageState.newType === AddressType.transparent) {
      _defaultTaddr = receivePageState.newAddress;

      // move this address to the front, since the scrollbar will reset when we re-render
      _taddrs.sort((x: Address, y: Address) => {
        return x.address === _defaultTaddr ? -1 : y.address === _defaultTaddr ? 1 : 0;
      });
    }
    setTaddrs(_taddrs);
    setDefaultTaddr(_defaultTaddr);
  }, [addresses, receivePageState]);

  useEffect(() => {
    const _addressBookMap = addressBook.reduce((m: Map<string, string>, obj: AddressBookEntry) => {
      m.set(obj.address, obj.label);
      return m;
    }, new Map());
    setAddressBookMap(_addressBookMap);
  }, [addressBook]);

  //console.log(uaddrs, defaultUaddr, rerenderKey);

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
              {uaddrs && uaddrs.length > 0 && (
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
                    />
                  ))}
                </Accordion>
              )}
              
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
              {zaddrs && zaddrs.length > 0 && (
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
                      openErrorModal={openErrorModal}
                    />
                  ))}
                </Accordion>
              )}
              

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
              {taddrs && taddrs.length > 0 && (
                <Accordion preExpanded={[defaultTaddr]}>
                  {taddrs.map((a: Address) => (
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
                      shieldTransparentBalanceToOrchard={shieldTransparentBalanceToOrchard}
                      calculateShieldFee={calculateShieldFee}
                      openErrorModal={openErrorModal}
                    />
                  ))}
                </Accordion>
              )}
              
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
};

export default Receive;
