import React, { useContext, useEffect, useState } from "react";
import { Accordion } from "react-accessible-accordion";
import styles from "./Addressbook.module.css";
import cstyles from "../common/Common.module.css";
import { AddressBookEntryClass, AddressKindEnum, ServerChainNameEnum, ZEC_SWAP_CHAIN } from "../appstate";
import ScrollPaneTop from "../scrollPane/ScrollPane";
import Utils from "../../utils/utils";
import AddressBookItem from "./components/AddressbookItem";
import { ContextApp } from "../../context/ContextAppState";
import { isZnsAlias, resolveZnsAlias } from "../../utils/zns";
import { extractPlainAddress, possibleChainsForAddress, validateAddressForChain } from "../../swap";
import { chainDisplayName } from "../swap/chainDisplayName";

type AddressBookProps = {
  addAddressBookEntry: (label: string, address: string, chain: ServerChainNameEnum, swapChain?: string) => void;
  removeAddressBookEntry: (label: string) => void;
};

const AddressBook: React.FC<AddressBookProps> = (props) => {
  const context = useContext(ContextApp);
  const { addressBook, currentWallet, addLabelState, setAddLabel, openConfirmModal } = context;

  const [currentLabel, setCurrentLabel] = useState<string>(addLabelState.label);
  const [currentAddress, setCurrentAddress] = useState<string>(addLabelState.address);
  const [addButtonEnabled, setAddButtonEnabled] = useState<boolean>(false);
  const [labelError, setLabelError] = useState<string | null>(null);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [addressKind, setAddressKind] = useState<AddressKindEnum | undefined>(undefined);
  const [isZns, setIsZns] = useState<boolean>(false);
  const [showAllNetworks, setShowAllNetworks] = useState<boolean>(false);
  const [addressBookSorted, setAddressBookSorted] = useState<AddressBookEntryClass[]>([]);
  // The asset chain the address belongs to. Narrowed from the address itself
  // rather than asked for blind: an address is already evidence of its own
  // chain, and a list of every chain SwapKit routes would be a worse question
  // than no question. Same approach the mobile wallet takes.
  const [swapChain, setSwapChain] = useState<string>(ZEC_SWAP_CHAIN);
  const [possibleChains, setPossibleChains] = useState<string[]>([ZEC_SWAP_CHAIN]);

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
  }, [currentLabel, currentAddress, swapChain]);

  // Which chains this address could belong to, recomputed as it is typed. The
  // delay keeps a half-typed address from being probed on every keystroke; the
  // cleanup means only the last one lands.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const chains = await possibleChainsForAddress(currentAddress, currentChain);
      if (cancelled) return;
      setPossibleChains(chains.length > 0 ? chains : [ZEC_SWAP_CHAIN]);
      // An address that cannot be the chain currently selected moves the
      // selection rather than leaving a contradiction on screen.
      if (chains.length > 0 && !chains.includes(swapChain)) setSwapChain(chains[0]);
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAddress, currentChain]);

  // The network filter is about Zcash networks, so it only has authority over
  // Zcash contacts. A Bitcoin address has no mainnet/testnet of ours to belong
  // to, and hiding it whenever the wallet is on testnet would lose it for no
  // reason — it is exactly as swappable either way.
  useEffect(() => {
    const visible = showAllNetworks
      ? addressBook
      : addressBook.filter((e) => (e.swapChain ?? ZEC_SWAP_CHAIN) !== ZEC_SWAP_CHAIN || e.chain === currentChain);
    setAddressBookSorted([...visible].sort((a, b) => a.label.localeCompare(b.label)));
  }, [addressBook, showAllNetworks, currentChain]);

  const updateLabel = (_currentLabel: string) => {
    setCurrentLabel(_currentLabel);
  };

  // A pasted payment URI (`bitcoin:…`, `ethereum:…`, and Zcash's own) is
  // unwrapped down to the bare address; anything else passes through. Without
  // this a perfectly good pasted URI would fail validation for the scheme
  // wrapped around it.
  const updateAddress = (_currentAddress: string) => {
    setCurrentAddress(extractPlainAddress(_currentAddress).replace(/\s+/g, ""));
  };

  const addButtonClicked = () => {
    const { addAddressBookEntry } = props;

    // The two chains answer different questions. `swapChain` is which asset
    // the address belongs to. `chain` is which Zcash network the entry lives
    // in — a real distinction for a ZEC contact, and none at all for a Bitcoin
    // one, which has no network of ours to belong to. Non-ZEC entries are
    // therefore filed under mainnet: swaps only happen there, so saving one
    // while the wallet sits on testnet would tag it with a network that has
    // nothing to do with it.
    const entryChain = swapChain === ZEC_SWAP_CHAIN ? currentChain : ServerChainNameEnum.mainChainName;
    const commit = () => {
      addAddressBookEntry(currentLabel, currentAddress.replace(/ /g, ""), entryChain, swapChain);
      clearFields();
    };

    // A Zcash address was parsed, so its chain is known rather than guessed.
    if (swapChain === ZEC_SWAP_CHAIN) {
      commit();
      return;
    }

    // Everything else is recognised by shape, and shapes are shared: every EVM
    // chain uses the same 0x form, and several UTXO chains the same bech32 one.
    // So the chain here can be a plausible guess rather than a fact, and a
    // contact filed under the wrong one becomes a swap sent to the wrong
    // network. Showing what was detected is the last chance to catch that.
    openConfirmModal(
      "Add contact",
      `Addresses on other chains are recognised by their shape, and some chains share a shape. ` +
        `Confirm this is a ${chainDisplayName(swapChain) || swapChain} address: ${currentAddress}`,
      commit,
    );
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

    // Branch 0: a non-ZEC contact. Its address is checked against its own
    // chain's rules — a Bitcoin address put through the Zcash parser would be
    // refused for not being something it was never meant to be. ZNS and the
    // Zcash address kinds below are Zcash-only concepts, so they are skipped.
    if (swapChain !== ZEC_SWAP_CHAIN) {
      if (_currentAddress === "") {
        return { _addressError: null, _addressKind: undefined, _isZns: false };
      }
      const valid = await validateAddressForChain(swapChain, _currentAddress, chain);
      if (!valid) {
        return {
          _addressError: `Not a valid ${chainDisplayName(swapChain) || swapChain} address`,
          _addressKind: undefined,
          _isZns: false,
        };
      }
      const dup = addressBook.find((i: AddressBookEntryClass) => i.address === _currentAddress);
      return { _addressError: dup ? "Duplicate Address" : null, _addressKind: undefined, _isZns: false };
    }

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
    setSwapChain(ZEC_SWAP_CHAIN);
    setPossibleChains([ZEC_SWAP_CHAIN]);
    setAddLabel(new AddressBookEntryClass("", ""));
  };

  return (
    <div>
      <div className={`${cstyles.xlarge} ${cstyles.screentitle} ${cstyles.center}`}>Address Book</div>

      <div className={styles.addressbookcontainer}>
        <div className={`${cstyles.well} ${cstyles.center}`}>
          <div className={cstyles.flexspacebetween}>
            <div className={cstyles.large}>Label</div>
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
            <div className={cstyles.large}>Address</div>
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
            placeholder="Unified | Sapling | Transparent | TEX address | name.zcash | any swappable asset"
            value={currentAddress}
            className={`${cstyles.inputbox} ${cstyles.margintopsmall}`}
            onChange={(e) => updateAddress(e.target.value)}
          />

          {/* Only worth asking when the address itself leaves room for doubt.
              Most addresses name exactly one chain, and offering a list of one
              would be a question with a single answer. */}
          {possibleChains.length > 1 && (
            <>
              <div className={cstyles.margintoplarge} />
              <div className={cstyles.flexspacebetween}>
                <div className={cstyles.large}>Chain</div>
              </div>
              <select
                aria-label="Chain"
                className={`${cstyles.inputbox} ${cstyles.margintopsmall}`}
                value={swapChain}
                onChange={(e) => setSwapChain(e.target.value)}
              >
                {possibleChains.map((chain) => (
                  <option key={chain} value={chain}>
                    {chainDisplayName(chain) || chain}
                  </option>
                ))}
              </select>
            </>
          )}
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
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 12,
            // The Label/Address column header below uses `marginnegativetitle`
            // (-20px top) and was overlapping this row, eating the clicks.
            // Keep clear of it with a stacking context + extra bottom space.
            position: "relative",
            zIndex: 1,
            marginBottom: 24,
          }}
        >
          <input
            type="checkbox"
            aria-label="Show contacts from all networks"
            checked={showAllNetworks}
            onChange={(e) => setShowAllNetworks(e.target.checked)}
            style={{
              width: 18,
              height: 18,
              cursor: "pointer",
              accentColor: "var(--color-primary)",
            }}
          />
          <span className={cstyles.small}>Show contacts from all networks</span>
        </div>

        {addressBookSorted && addressBookSorted.length > 0 && (
          <div className={`${cstyles.flexspacebetween} ${cstyles.xlarge} ${cstyles.marginnegativetitle}`}>
            <div style={{ marginLeft: 40, marginBottom: 15 }}>Label</div>
            <div style={{ marginRight: 100, marginBottom: 15 }}>Address</div>
          </div>
        )}

        <ScrollPaneTop offsetHeight={327}>
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
