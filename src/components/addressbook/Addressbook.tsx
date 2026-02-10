import React, { useContext, useEffect, useState } from "react";
import { Accordion } from "react-accessible-accordion";
import styles from "./Addressbook.module.css";
import cstyles from "../common/Common.module.css";
import { AddressBookEntryClass, AddressKindEnum, ServerChainNameEnum } from "../appstate";
import ScrollPaneTop from "../scrollPane/ScrollPane";
import Utils from "../../utils/utils";
import AddressBookItem from './components/AddressbookItem';
import { ContextApp } from "../../context/ContextAppState";

type AddressBookProps = {
  addAddressBookEntry: (label: string, address: string) => void;
  removeAddressBookEntry: (label: string) => void;
};

const AddressBook: React.FC<AddressBookProps> = (props) => { 
  const context = useContext(ContextApp);
  const { addressBook, currentWallet, addLabelState, setAddLabel } = context;

  const [currentLabel, setCurrentLabel] = useState<string>(addLabelState.label);
  const [currentAddress, setCurrentAddress] = useState<string>(addLabelState.address);
  const [addButtonEnabled, setAddButtonEnabled] = useState<boolean>(false);
  const [labelError, setLabelError] = useState<string | null>(null);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [addressKind, setAddressKind] = useState<AddressKindEnum | undefined>(undefined);
  const [addressBookSorted, setAddressBookSorted] = useState<AddressBookEntryClass[]>([]);

  useEffect(() => {
    (async () => {
      const { _labelError } = validateLabel(currentLabel);
      const { _addressError, _addressKind } = await validateAddress(currentAddress);
      setLabelError(_labelError);
      setAddressError(_addressError);
      setAddressKind(_addressKind);
      setAddButtonEnabled(!_labelError && !_addressError && currentLabel !== "" && currentAddress !== ""); 
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLabel, currentAddress])

  useEffect(() => {
    setAddressBookSorted(addressBook.sort((a, b) => {
      const aLabel = a.label;
      const bLabel = b.label;
      return aLabel.localeCompare(bLabel);
    }))
  }, [addressBook]);

  const updateLabel = (_currentLabel: string) => {
    setCurrentLabel(_currentLabel);
  };

  const updateAddress = (_currentAddress: string) => {
    setCurrentAddress(_currentAddress);
  };

  const addButtonClicked = () => {
    const { addAddressBookEntry } = props;

    addAddressBookEntry(currentLabel, currentAddress.replace(/ /g, ""));
    clearFields();
  };

  const validateLabel = (_currentLabel: string) => {
    let _labelError: string | null = addressBook.find((i: AddressBookEntryClass) => i.label === _currentLabel) ? "Duplicate Label" : null;
    _labelError = _currentLabel.length > 20 ? "Label is too long" : _labelError;

    return { _labelError };
  };

  const validateAddress = async (_currentAddress: string) => {
    const _addressKind: AddressKindEnum | undefined = await Utils.getAddressKind(_currentAddress, currentWallet ? currentWallet.chain_name : ServerChainNameEnum.mainChainName);
    let _addressError: string | null = _currentAddress === "" || _addressKind !== undefined ? null : 'Invalid Address';
    if (!_addressError) {
      _addressError = addressBook.find((i: AddressBookEntryClass) => i.address === _currentAddress) ? 'Duplicate Address' : null;
    }

    return { _addressError, _addressKind };
  };

  const clearFields = () => {
    setCurrentLabel('');
    setCurrentAddress('');
    setAddButtonEnabled(false);
    setLabelError(null);
    setAddressError(null);
    setAddressKind(undefined);
    setAddLabel(new AddressBookEntryClass('', ''));
  };

  return (
    <div>
      <div className={[cstyles.xlarge, cstyles.margintoplarge, cstyles.center].join(" ")}>Address Book</div>

      <div className={styles.addressbookcontainer}>
        <div className={[cstyles.well, cstyles.center].join(" ")}>
          <div className={[cstyles.flexspacebetween].join(" ")}>
            <div className={cstyles.sublight}>Label</div>
            <div className={cstyles.validationerror}>
              {!labelError ? (
                <i className={[cstyles.green, "fas", "fa-check"].join(" ")} />
              ) : (
                <span className={cstyles.red}>{labelError}</span>
              )}
            </div>
          </div>
          <input
            type="text"
            value={currentLabel}
            className={[cstyles.inputbox, cstyles.margintopsmall].join(" ")}
            onChange={(e) => updateLabel(e.target.value)}
          />

          <div className={cstyles.margintoplarge} />

          <div className={[cstyles.flexspacebetween].join(" ")}>
            <div className={cstyles.sublight}>Address</div>
            <div className={[cstyles.sublight, cstyles.green].join(" ")}>
              {addressKind !== undefined && addressKind === AddressKindEnum.tex && 'TEX'}
              {addressKind !== undefined && addressKind === AddressKindEnum.transparent && 'Transparent'}
              {addressKind !== undefined && addressKind === AddressKindEnum.sapling && 'Sapling'}
              {addressKind !== undefined && addressKind === AddressKindEnum.unified && 'Unified'}
            </div>
            <div className={cstyles.validationerror}>
              {!addressError ? (
                <i className={[cstyles.green, "fas", "fa-check"].join(" ")} />
              ) : (
                <span className={cstyles.red}>{addressError}</span>
              )}
            </div>
          </div>
          <input
            type="text"
            placeholder="Unified | Sapling | Transparent | TEX address"
            value={currentAddress}
            className={[cstyles.inputbox, cstyles.margintopsmall].join(" ")}
            onChange={(e) => updateAddress(e.target.value)}
          />
        </div>

        <div className={cstyles.margintoplarge} />

        <div className={[cstyles.center].join(" ")}>
          <button
            type="button"
            className={cstyles.primarybutton}
            disabled={!addButtonEnabled}
            onClick={addButtonClicked}
          >
            Add
          </button>
          <button type="button" className={cstyles.primarybutton} onClick={clearFields}>
            Clear
          </button>
        </div>

        {addressBookSorted && addressBookSorted.length > 0 && ( 
          <div className={[cstyles.flexspacebetween, cstyles.xlarge, cstyles.marginnegativetitle].join(" ")}>
            <div style={{ marginLeft: 40, marginBottom: 15 }}>Label</div>
            <div style={{ marginRight: 100, marginBottom: 15 }}>Address</div>
          </div>
        )}

        <ScrollPaneTop offsetHeight={330}>
          <div className={styles.addressbooklist}>
            {addressBookSorted && addressBookSorted.length > 0 && (
              <Accordion>
                {addressBook.map((item: AddressBookEntryClass) => (
                  <AddressBookItem
                    key={item.label}
                    item={item}
                    removeAddressBookEntry={props.removeAddressBookEntry}
                  />
                ))}
              </Accordion>
            )}
          </div>
        </ScrollPaneTop>
      </div>
    </div>
  );
};

export default AddressBook;