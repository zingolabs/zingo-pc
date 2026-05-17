import React, { useContext, useEffect, useState } from "react";
import { Accordion } from "react-accessible-accordion";
import styles from "./Addressbook.module.css";
import cstyles from "../common/Common.module.css";
import { AddressBookEntryClass, AddressKindEnum, ServerChainNameEnum } from "../appstate";
import ScrollPaneTop from "../scrollPane/ScrollPane";
import Utils from "../../utils/utils";
import AddressBookItem from "./components/AddressbookItem";
import { ContextApp } from "../../context/ContextAppState";
import { isZnsAlias, resolveZnsAlias } from "../../utils/zns";

type AddressBookProps = {
  addAddressBookEntry: (label: string, address: string, chain: ServerChainNameEnum) => void;
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
  const [isZns, setIsZns] = useState<boolean>(false);
  const [showAllNetworks, setShowAllNetworks] = useState<boolean>(false);
  const [addressBookSorted, setAddressBookSorted] = useState<AddressBookEntryClass[]>([]);

  const currentChain: ServerChainNameEnum = currentWallet
    ? currentWallet.chain_name
    : ServerChainNameEnum.mainChainName;

  useEffect(() => {
    (async () => {
      const { _labelError } = validateLabel(currentLabel);
      const { _addressError, _addressKind, _isZns } = await validateAddress(currentAddress);
      setLabelError(_labelError);
      setAddressError(_addressError);
      setAddressKind(_addressKind);
      setIsZns(_isZns);
      setAddButtonEnabled(!_labelError && !_addressError && currentLabel !== "" && currentAddress !== "");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLabel, currentAddress]);

  useEffect(() => {
    const visible = showAllNetworks ? addressBook : addressBook.filter((e) => e.chain === currentChain);
    setAddressBookSorted([...visible].sort((a, b) => a.label.localeCompare(b.label)));
  }, [addressBook, showAllNetworks, currentChain]);

  const updateLabel = (_currentLabel: string) => {
    setCurrentLabel(_currentLabel);
  };

  const updateAddress = (_currentAddress: string) => {
    setCurrentAddress(_currentAddress);
  };

  const addButtonClicked = () => {
    const { addAddressBookEntry } = props;

    addAddressBookEntry(currentLabel, currentAddress.replace(/ /g, ""), currentChain);
    clearFields();
  };

  const validateLabel = (_currentLabel: string) => {
    let _labelError: string | null = addressBook.find((i: AddressBookEntryClass) => i.label === _currentLabel)
      ? "Duplicate Label"
      : null;
    _labelError = _currentLabel.length > 20 ? "Label is too long" : _labelError;

    return { _labelError };
  };

  const validateAddress = async (_currentAddress: string) => {
    const chain = currentWallet ? currentWallet.chain_name : ServerChainNameEnum.mainChainName;

    // Branch A: ZNS alias like "alice.zcash" — accept iff it resolves on the
    // current network. We store the alias itself (not the resolved UA) so the
    // contact re-resolves every time it's used.
    if (isZnsAlias(_currentAddress)) {
      const result = await resolveZnsAlias(_currentAddress, chain);
      if (!result.ok) {
        const error =
          result.reason === "not-found"
            ? "ZNS name not found"
            : result.reason === "network"
              ? "ZNS lookup failed"
              : result.reason === "unsupported-chain"
                ? "ZNS is not available on this network"
                : "Invalid ZNS alias";
        return { _addressError: error, _addressKind: undefined, _isZns: false };
      }
      const dup = addressBook.find(
        (i: AddressBookEntryClass) => i.address.toLowerCase() === _currentAddress.toLowerCase(),
      );
      return { _addressError: dup ? "Duplicate Address" : null, _addressKind: undefined, _isZns: true };
    }

    // Branch B: plain Zcash address — validate format against current network.
    const _addressKind: AddressKindEnum | undefined = await Utils.getAddressKind(_currentAddress, chain);
    let _addressError: string | null = _currentAddress === "" || _addressKind !== undefined ? null : "Invalid Address";
    if (!_addressError) {
      _addressError = addressBook.find((i: AddressBookEntryClass) => i.address === _currentAddress)
        ? "Duplicate Address"
        : null;
    }

    return { _addressError, _addressKind, _isZns: false };
  };

  const clearFields = () => {
    setCurrentLabel("");
    setCurrentAddress("");
    setAddButtonEnabled(false);
    setLabelError(null);
    setAddressError(null);
    setAddressKind(undefined);
    setIsZns(false);
    setAddLabel(new AddressBookEntryClass("", ""));
  };

  return (
    <div>
      <div className={`${cstyles.xlarge} ${cstyles.margintoplarge} ${cstyles.center}`}>Address Book</div>

      <div className={styles.addressbookcontainer}>
        <div className={`${cstyles.well} ${cstyles.center}`}>
          <div className={cstyles.flexspacebetween}>
            <div className={cstyles.sublight}>Label</div>
            <div className={cstyles.validationerror}>
              {!labelError ? (
                <i className={`${cstyles.green} ${"fas"} ${"fa-check"}`} />
              ) : (
                <span className={cstyles.red}>{labelError}</span>
              )}
            </div>
          </div>
          <input
            type="text"
            aria-label="Label"
            value={currentLabel}
            className={`${cstyles.inputbox} ${cstyles.margintopsmall}`}
            onChange={(e) => updateLabel(e.target.value)}
          />

          <div className={cstyles.margintoplarge} />

          <div className={cstyles.flexspacebetween}>
            <div className={cstyles.sublight}>Address</div>
            <div className={`${cstyles.sublight} ${cstyles.green}`}>
              {isZns && "ZNS"}
              {!isZns && addressKind === AddressKindEnum.tex && "TEX"}
              {!isZns && addressKind === AddressKindEnum.transparent && "Transparent"}
              {!isZns && addressKind === AddressKindEnum.sapling && "Sapling"}
              {!isZns && addressKind === AddressKindEnum.unified && "Unified"}
            </div>
            <div className={cstyles.validationerror}>
              {!addressError ? (
                <i className={`${cstyles.green} ${"fas"} ${"fa-check"}`} />
              ) : (
                <span className={cstyles.red}>{addressError}</span>
              )}
            </div>
          </div>
          <input
            type="text"
            aria-label="Address"
            placeholder="Unified | Sapling | Transparent | TEX address | name.zcash"
            value={currentAddress}
            className={`${cstyles.inputbox} ${cstyles.margintopsmall}`}
            onChange={(e) => updateAddress(e.target.value)}
          />
        </div>

        <div className={cstyles.margintoplarge} />

        <div className={cstyles.center}>
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

        <div
          className={cstyles.margintoplarge}
          style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8 }}
        >
          <label className={cstyles.small} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              aria-label="Show contacts from all networks"
              checked={showAllNetworks}
              onChange={(e) => setShowAllNetworks(e.target.checked)}
              style={{ accentColor: "var(--color-primary)" }}
            />
            Show contacts from all networks
          </label>
        </div>

        {addressBookSorted && addressBookSorted.length > 0 && (
          <div className={`${cstyles.flexspacebetween} ${cstyles.xlarge} ${cstyles.marginnegativetitle}`}>
            <div style={{ marginLeft: 40, marginBottom: 15 }}>Label</div>
            <div style={{ marginRight: 100, marginBottom: 15 }}>Address</div>
          </div>
        )}

        <ScrollPaneTop offsetHeight={330}>
          <div className={styles.addressbooklist}>
            {addressBookSorted && addressBookSorted.length > 0 && (
              <Accordion>
                {addressBookSorted.map((item: AddressBookEntryClass) => (
                  <AddressBookItem
                    key={item.label}
                    item={item}
                    removeAddressBookEntry={props.removeAddressBookEntry}
                    showChain={showAllNetworks}
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
