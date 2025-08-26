import React, { useContext, useEffect, useState } from "react";
import { Tab, Tabs, TabList, TabPanel } from "react-tabs";
import { Accordion } from "react-accessible-accordion";
import styles from "./Receive.module.css";
import { AddressBookEntryClass, AddressScopeEnum, TransparentAddressClass, UnifiedAddressClass } from "../appstate";
import ScrollPaneTop from "../scrollPane/ScrollPane";
import AddressBlock from "./components/AddressBlock";
import { ContextApp } from "../../context/ContextAppState";

type ReceiveProps = {
  calculateShieldFee: () => Promise<number>;
  handleShieldButton: () => void;
  openErrorModal: (title: string, body: string | JSX.Element) => void;
};

const Receive: React.FC<ReceiveProps> = ({ 
  calculateShieldFee, 
  handleShieldButton,
  openErrorModal,
}) => {
  const context = useContext(ContextApp);
  const {
    addressesUnified,
    addressesTransparent,
    addressBook,
    info,
    orchardPool,
    saplingPool,
    transparentPool,
  } = context;

  const [uaddrs, setUaddrs] = useState<UnifiedAddressClass[]>([]);
  const [defaultUaddr, setDefaultUaddr] = useState<string>('')
  const [taddrs, setTaddrs] = useState<TransparentAddressClass[]>([]);
  const [defaultTaddr, setDefaultTaddr] = useState<string>('')
  const [addressBookMap, setAddressBookMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const _uaddrs: UnifiedAddressClass[] = [...addressesUnified].reverse();
    let _defaultUaddr: string = _uaddrs.length > 0 ? _uaddrs[0].encoded_address : "";
    setUaddrs(_uaddrs);
    setDefaultUaddr(_defaultUaddr);
  }, [addressesUnified]);
  
  useEffect(() => {
    const _taddrs: TransparentAddressClass[] = [...addressesTransparent.filter((t: TransparentAddressClass) => t.scope === AddressScopeEnum.external)].reverse();
    let _defaultTaddr: string = _taddrs.length > 0 ? _taddrs[0].encoded_address : "";
    setTaddrs(_taddrs);
    setDefaultTaddr(_defaultTaddr);
  }, [addressesTransparent]);

  useEffect(() => {
    const _addressBookMap = addressBook.reduce((m: Map<string, string>, obj: AddressBookEntryClass) => {
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
            {(orchardPool || saplingPool) && <Tab>Unified</Tab>}
            {transparentPool && <Tab>Transparent</Tab>}
          </TabList>

          <TabPanel>
            {(orchardPool || saplingPool) && !!uaddrs && uaddrs.length > 0 && (
              <ScrollPaneTop offsetHeight={100}>
                <Accordion preExpanded={[defaultUaddr]}>
                  {uaddrs.map((a: UnifiedAddressClass) => (
                    <AddressBlock
                      key={`u-${a.encoded_address}`}
                      address={a}
                      currencyName={info.currencyName}
                      label={addressBookMap.get(a.encoded_address)}
                      type={'u'}
                      openErrorModal={openErrorModal}
                    />
                  ))}
                </Accordion>
              </ScrollPaneTop>
            )}
          </TabPanel>
  
          <TabPanel>
            {transparentPool && !!taddrs && taddrs.length > 0 && (
              <ScrollPaneTop offsetHeight={100}>
                <Accordion preExpanded={[defaultTaddr]}>
                  {taddrs.map((a: TransparentAddressClass) => (
                    <AddressBlock
                      key={`t-${a.encoded_address}`}
                      address={a}
                      currencyName={info.currencyName}
                      label={addressBookMap.get(a.encoded_address)}
                      type={'t'}
                      openErrorModal={openErrorModal}
                      calculateShieldFee={calculateShieldFee}
                      handleShieldButton={handleShieldButton}
                    />
                  ))}
                </Accordion>
              </ScrollPaneTop>
            )}
          </TabPanel>
        </Tabs>
      </div>
    </div>
  );
};

export default Receive;
