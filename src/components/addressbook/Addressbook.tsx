import React, { Component } from "react";
import { Accordion } from "react-accessible-accordion";
import styles from "./Addressbook.module.css";
import cstyles from "../common/Common.module.css";
import { AddressBookEntry } from "../appstate";
import ScrollPane from "../scrollPane/ScrollPane";
import Utils from "../../utils/utils";
import { ZcashURITarget } from "../../utils/uris";
import AddressBookItem from './components/AddressbookItem';

type AddressBookProps = {
  addressBook: AddressBookEntry[];
  addAddressBookEntry: (label: string, address: string) => void;
  removeAddressBookEntry: (label: string) => void;
  setSendTo: (targets: ZcashURITarget[] | ZcashURITarget) => void;
};

type AddressBookState = {
  currentLabel: string;
  currentAddress: string;
  addButtonEnabled: boolean;
};

export default class AddressBook extends Component<AddressBookProps, AddressBookState> {
  constructor(props: AddressBookProps) {
    super(props);

    this.state = { currentLabel: "", currentAddress: "", addButtonEnabled: false };
  }

  updateLabel = (currentLabel: string) => {
    // Don't update the field if it is longer than 20 chars
    if (currentLabel.length > 20) return;

    const { currentAddress } = this.state;
    this.setState({ currentLabel });

    const { labelError, addressIsValid } = this.validate(currentLabel, currentAddress);
    this.setAddButtonEnabled(!labelError && addressIsValid && currentLabel !== "" && currentAddress !== "");
  };

  updateAddress = (currentAddress: string) => {
    const { currentLabel } = this.state;
    this.setState({ currentAddress });

    const { labelError, addressIsValid } = this.validate(currentLabel, currentAddress);

    this.setAddButtonEnabled(!labelError && addressIsValid && currentLabel !== "" && currentAddress !== "");
  };

  addButtonClicked = () => {
    const { addAddressBookEntry } = this.props;
    const { currentLabel, currentAddress } = this.state;

    addAddressBookEntry(currentLabel, currentAddress);
    this.setState({ currentLabel: "", currentAddress: "" });
  };

  setAddButtonEnabled = (addButtonEnabled: boolean) => {
    this.setState({ addButtonEnabled });
  };

  validate = (currentLabel: string, currentAddress: string) => {
    const { addressBook } = this.props;

    let labelError = addressBook.find((i) => i.label === currentLabel) ? "Duplicate Label" : null;
    labelError = currentLabel.length > 12 ? "Label is too long" : labelError;

    const addressIsValid =
      currentAddress === "" || Utils.isZaddr(currentAddress) || Utils.isTransparent(currentAddress);

    return { labelError, addressIsValid };
  };

  render() {
    const { addressBook, removeAddressBookEntry, setSendTo } = this.props;
    const { currentLabel, currentAddress, addButtonEnabled } = this.state;

    const { labelError, addressIsValid } = this.validate(currentLabel, currentAddress);

    return (
      <div>
        <div className={[cstyles.xlarge, cstyles.padall, cstyles.center].join(" ")}>Address Book</div>

        <div className={styles.addressbookcontainer}>
          <div className={[cstyles.well].join(" ")}>
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
              value={currentAddress}
              className={[cstyles.inputbox, cstyles.margintopsmall].join(" ")}
              onChange={(e) => this.updateAddress(e.target.value)}
            />

            <div className={cstyles.margintoplarge} />

            <button
              type="button"
              className={cstyles.primarybutton}
              disabled={!addButtonEnabled}
              onClick={this.addButtonClicked}
            >
              Add
            </button>
          </div>

          <ScrollPane offsetHeight={300}>
            <div className={styles.addressbooklist}>
              <div className={[cstyles.flexspacebetween, cstyles.tableheader, cstyles.sublight].join(" ")}>
                <div>Label</div>
                <div>Address</div>
              </div>
              {addressBook && (
                <Accordion>
                  {addressBook.map((item) => (
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
