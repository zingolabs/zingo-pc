import React, { useContext, useEffect, useState } from "react";
import { Accordion } from "react-accessible-accordion";
import styles from "./Addressbook.module.css";
import cstyles from "../common/Common.module.css";
import { AddressBookEntry, AddressType } from "../appstate";
import ScrollPane from "../scrollPane/ScrollPane";
import Utils from "../../utils/utils";
import { ZcashURITarget } from "../../utils/uris";
import AddressBookItem from './components/AddressbookItem';
import { ContextApp } from "../../context/ContextAppState";

type AddressBookProps = {
  addAddressBookEntry: (label: string, address: string) => void;
  removeAddressBookEntry: (label: string) => void;
  setSendTo: (targets: ZcashURITarget[] | ZcashURITarget) => void;
};

const AddressBook: React.FC<AddressBookProps> = (props) => { 
  const context = useContext(ContextApp);
  const { addressBook } = context;

  const [currentLabel, setCurrentLabel] = useState<string>('');
  const [currentAddress, setCurrentAddress] = useState<string>('');
  const [addButtonEnabled, setAddButtonEnabled] = useState<boolean>(false);
  const [labelError, setLabelError] = useState<string | null>(null);
  const [addressIsValid, setAddressIsValid] = useState<boolean>(true);
  const [addressType, setAddressType] = useState<AddressType | undefined>(undefined);

  useEffect(() => {
    (async () => {
      const { _labelError, _addressIsValid, _addressType } = await validate(currentLabel, currentAddress);
      setLabelError(_labelError);
      setAddressIsValid(_addressIsValid);
      setAddressType(_addressType);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLabel, currentAddress])


  const updateLabel = async (_currentLabel: string) => {
    const _currentAddress = currentAddress;
    const { _labelError, _addressIsValid } = await validate(_currentLabel, _currentAddress);
    setLabelError(_labelError);
    setAddressIsValid(_addressIsValid);
    setCurrentLabel(_currentLabel);
    setAddButtonEnabled(!_labelError && _addressIsValid && _currentLabel !== "" && _currentAddress !== ""); 
  };

  const updateAddress = async (_currentAddress: string) => {
    const _currentLabel = currentLabel;
    const { _labelError, _addressIsValid } = await validate(_currentLabel, _currentAddress);
    setLabelError(_labelError);
    setAddressIsValid(_addressIsValid);
    setCurrentAddress(_currentAddress);
    setAddButtonEnabled(!_labelError && _addressIsValid && _currentLabel !== "" && _currentAddress !== "");
  };

  const addButtonClicked = () => {
    const { addAddressBookEntry } = props;

    addAddressBookEntry(currentLabel, currentAddress.replace(/ /g, ""));
    clearFields();
  };

  const validate = async (_currentLabel: string, _currentAddress: string) => {
    let _labelError: string | null = addressBook.find((i: AddressBookEntry) => i.label === _currentLabel) ? "Duplicate Label" : null;
    _labelError = _currentLabel.length > 12 ? "Label is too long" : _labelError;

    const _addressType: AddressType | undefined = await Utils.getAddressType(_currentAddress);
    const _addressIsValid: boolean =
      _currentAddress === "" || _addressType !== undefined; 

    return { _labelError, _addressIsValid, _addressType };
  };

  const clearFields = () => {
    setCurrentLabel('');
    setCurrentAddress('');
    setAddButtonEnabled(false);
    setLabelError('');
    setAddressIsValid(true);
    setAddressType(undefined);
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
              {addressType !== undefined && addressType === AddressType.sapling && 'Sapling'}
              {addressType !== undefined && addressType === AddressType.transparent && 'Transparent'}
              {addressType !== undefined && addressType === AddressType.unified && 'Unified'}
            </div>
            <div className={cstyles.validationerror}>
              {addressIsValid ? (
                <i className={[cstyles.green, "fas", "fa-check"].join(" ")} />
              ) : (
                <span className={cstyles.red}>Invalid Address</span>
              )}
            </div>
          </div>
          <input
            type="text"
            placeholder="Unified | Sapling | Transparent address"
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

        {addressBook && addressBook.length > 0 && ( 
          <div className={[cstyles.flexspacebetween, cstyles.xlarge, cstyles.marginnegativetitle].join(" ")}>
            <div style={{ marginLeft: 40, marginBottom: 15 }}>Label</div>
            <div style={{ marginRight: 100, marginBottom: 15 }}>Address</div>
          </div>
        )}

        <ScrollPane offsetHeight={320}>
          <div className={styles.addressbooklist}>
            {addressBook && addressBook.length > 0 && (
              <Accordion>
                {addressBook.map((item: AddressBookEntry) => (
                  <AddressBookItem
                    key={item.label}
                    item={item}
                    removeAddressBookEntry={props.removeAddressBookEntry}
                    setSendTo={props.setSendTo}
                  />
                ))}
              </Accordion>
            )}
          </div>
        </ScrollPane>
      </div>
    </div>
  );
};

export default AddressBook;