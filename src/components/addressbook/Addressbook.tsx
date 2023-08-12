import React, { Component } from "react";
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

type AddressBookState = {
  currentLabel: string;
  currentAddress: string;
  addButtonEnabled: boolean;
  labelError: string | null;
  addressIsValid: boolean;
  addressType?: AddressType;
};

export default class AddressBook extends Component<AddressBookProps, AddressBookState> { 
  static contextType = ContextApp;
  constructor(props: AddressBookProps) {
    super(props);

    this.state = { 
      currentLabel: "", 
      currentAddress: "", 
      addButtonEnabled: false,
      labelError: null,
      addressIsValid: true,
    };
  }

  async componentDidMount() {
    const{ labelError, addressIsValid, addressType } = await this.validate(this.state.currentLabel, this.state.currentAddress);
    this.setState({
      labelError,
      addressIsValid,
      addressType,
    });
  }


  updateLabel = async (currentLabel: string) => {
    const { currentAddress } = this.state;

    const { labelError, addressIsValid } = await this.validate(currentLabel, currentAddress);
    this.setState({
      labelError,
      addressIsValid,
      currentLabel,
    });
    this.setAddButtonEnabled(!labelError && addressIsValid && currentLabel !== "" && currentAddress !== ""); 
  };

  updateAddress = async (currentAddress: string) => {
    const { currentLabel } = this.state;

    const { labelError, addressIsValid } = await this.validate(currentLabel, currentAddress);
    this.setState({
      labelError,
      addressIsValid,
      currentAddress,
    });
    this.setAddButtonEnabled(!labelError && addressIsValid && currentLabel !== "" && currentAddress !== "");
  };

  addButtonClicked = () => {
    const { addAddressBookEntry } = this.props;
    const { currentLabel, currentAddress } = this.state;

    addAddressBookEntry(currentLabel, currentAddress.replace(/ /g, ""));
    this.setState({ currentLabel: "", currentAddress: "", addButtonEnabled: false });
  };

  setAddButtonEnabled = (addButtonEnabled: boolean) => {
    this.setState({ addButtonEnabled });
  };

  validate = async (currentLabel: string, currentAddress: string) => {
    const { addressBook } = this.context;

    let labelError = addressBook.find((i: AddressBookEntry) => i.label === currentLabel) ? "Duplicate Label" : null;
    labelError = currentLabel.length > 12 ? "Label is too long" : labelError;

    const addressType = await Utils.getAddressType(currentAddress);
    const addressIsValid =
      currentAddress === "" || addressType !== undefined; 

    return { labelError, addressIsValid, addressType };
  };

  clearFields = () => {
    this.setState({ currentLabel: "", currentAddress: "", addButtonEnabled: false, labelError: "", addressIsValid: true, addressType: undefined });
  };

  render() {
    const { removeAddressBookEntry, setSendTo } = this.props;
    const { addressBook } = this.context;
    const { currentLabel, currentAddress, addButtonEnabled, labelError, addressIsValid, addressType } = this.state;

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
              onChange={(e) => this.updateLabel(e.target.value)}
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
              onChange={(e) => this.updateAddress(e.target.value)}
            />
          </div>

          <div className={cstyles.margintoplarge} />

          <div className={[cstyles.center].join(" ")}>
            <button
              type="button"
              className={cstyles.primarybutton}
              disabled={!addButtonEnabled}
              onClick={this.addButtonClicked}
            >
              Add
            </button>
            <button type="button" className={cstyles.primarybutton} onClick={this.clearFields}>
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
                      removeAddressBookEntry={removeAddressBookEntry}
                      setSendTo={setSendTo}
                    />
                  ))}
                </Accordion>
              )}
            </div>
          </ScrollPane>
        </div>
      </div>
    );
  }
}
