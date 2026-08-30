import React, { useContext, useEffect, useState } from "react";
import { Accordion } from "react-accessible-accordion";
import styles from "./Addressbook.module.css";
import cstyles from "../common/Common.module.css";
import { AddressBookEntryClass, AddressKindEnum, ServerChainNameEnum, ZEC_SWAP_CHAIN } from "../appstate";
import ScrollPaneTop from "../scrollPane/ScrollPane";
import { usePaneOffset } from "../scrollPane/usePaneOffset";
import ChainPicker from "../common/ChainPicker";
import { ChainBadge } from "../common/ChainBadge";
import Utils from "../../utils/utils";
import AddressBookItem from "./components/AddressbookItem";
import { ContextApp } from "../../context/ContextAppState";
import { isZnsAlias, resolveZnsAlias } from "../../utils/zns";
import { extractPlainAddress, possibleChainsForAddress, validateAddressForChain } from "../../swap";
import { chainDisplayName } from "../swap/chainDisplayName";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

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

  // Measured rather than assumed: without it the pane ran past the bottom of
  // the window and the last contact could not be scrolled to.
  const { paneRef, paneOffset } = usePaneOffset(327);

  const [chainPickerOpen, setChainPickerOpen] = useState<boolean>(false);

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
      {chainPickerOpen && (
        <ChainPicker
          chains={possibleChains}
          selected={swapChain}
          modalIsOpen={chainPickerOpen}
          closeModal={() => setChainPickerOpen(false)}
          onSelect={setSwapChain}
        />
      )}

      <div className={`${cstyles.xlarge} ${cstyles.screentitle} ${cstyles.center}`}>Address Book</div>

      <div className={styles.addressbookcontainer}>
        {/* The address goes first because it is what the entry is, and because
            it decides what the chain selector below can offer. The name and the
            chain describe it and share the line under it — stacked one per row
            with a large gap between each, this form took most of the screen and
            left the list it belongs to a strip at the bottom. */}
        <div className={`${cstyles.well} ${cstyles.center}`}>
          <div className={cstyles.flexspacebetween}>
            <div>Address</div>
            <div className={`${cstyles.sublight} ${cstyles.green}`}>
              {isZns && "ZNS"}
              {!isZns && addressKind === AddressKindEnum.tex && "TEX"}
              {!isZns && addressKind === AddressKindEnum.transparent && "Transparent"}
              {!isZns && addressKind === AddressKindEnum.sapling && "Sapling"}
              {!isZns && addressKind === AddressKindEnum.unified && "Unified"}
            </div>
            <div className={cstyles.validationerror}>
              {/* An empty field has no error, which is not the same as being
                  right — the tick used to greet an untouched form claiming
                  both fields were good before anything was typed. Nothing is
                  shown until there is something to judge. */}
              {!!addressError && <span className={cstyles.red}>{addressError}</span>}
              {!addressError && currentAddress !== "" && (
                <i className={`${cstyles.green} ${"fas"} ${"fa-check"}`} data-testid="address-valid" />
              )}
            </div>
          </div>
          <div className={`${cstyles.fieldrow} ${cstyles.margintopsmall}`}>
            <input
              type="text"
              aria-label="Address"
              className={cstyles.fieldinput}
              placeholder="Unified | Sapling | Transparent | TEX | name.zcash | any swappable asset"
              value={currentAddress}
              onChange={(e) => updateAddress(e.target.value)}
            />
          </div>

          <div className={cstyles.horizontalflex} style={{ gap: 16, marginTop: 12, alignItems: "flex-start" }}>
            <div style={{ flex: 2, minWidth: 0 }}>
              <div className={cstyles.flexspacebetween}>
                <div>Label</div>
                <div className={cstyles.validationerror}>
                  {!!labelError && <span className={cstyles.red}>{labelError}</span>}
                  {!labelError && currentLabel !== "" && (
                    <i className={`${cstyles.green} ${"fas"} ${"fa-check"}`} data-testid="label-valid" />
                  )}
                </div>
              </div>
              <div className={`${cstyles.fieldrow} ${cstyles.margintopsmall}`}>
                <input
                  type="text"
                  aria-label="Label"
                  className={cstyles.fieldinput}
                  value={currentLabel}
                  onChange={(e) => updateLabel(e.target.value)}
                />
              </div>
            </div>

            {/* Always here, defaulting to Zcash, and always changeable. Which
                chain a contact is filed under decides where a swap to it is
                sent — the Add button already stops to confirm it — so it is a
                field the user fills in, not a conclusion the form reaches and
                shows only when it feels uncertain.

                The address narrows what it can be set to: an address is
                evidence of its own chain, so once one is typed the list is the
                chains that could hold it, and the selection moves to one of
                them. With the field empty every chain is offered. */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div>Chain</div>
              {/* A button rather than a select. The chain is recognised by
                    its badge before it is read, which a native select has
                    nowhere to put — and it rendered as whatever the platform
                    decided, next to two fields that did not. */}
              <button
                type="button"
                aria-label="Chain"
                className={`${cstyles.fieldrow} ${cstyles.margintopsmall}`}
                // `color: inherit` because a button does not inherit it:
                // without it everything in here that does not set its own takes
                // the platform's default button text, which on this dark field
                // is the colour of the field itself.
                style={{ width: "100%", cursor: "pointer", textAlign: "left", color: "inherit" }}
                onClick={() => setChainPickerOpen(true)}
              >
                {/* The badge says which chain without being read, and the
                      chevron says the field is a choice rather than something
                      the form worked out and is telling you. */}
                <span style={{ display: "flex", paddingLeft: 12 }}>
                  <ChainBadge chain={swapChain} size={20} />
                </span>
                <div className={cstyles.fieldinput}>{chainDisplayName(swapChain) || swapChain}</div>
                {/* No colour of its own, the way the swap screen's asset chip
                      leaves its chevron to inherit — which is what `color:
                      inherit` on the button above is for. Same size as that
                      one, since they mark the same thing: that this opens. */}
                <FontAwesomeIcon
                  icon={faChevronDown}
                  data-testid="chain-chevron"
                  style={{ paddingRight: 18, fontSize: 12 }}
                />
              </button>
            </div>
          </div>
        </div>

        <div className={cstyles.center} style={{ marginTop: 16 }}>
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
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 12,
            marginTop: 16,
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

        {/* The form above this is not a fixed height: each field's validation
            line appears and disappears, the chain select exists only for an
            address that could belong to more than one, and the column header
            only while there is something under it. */}
        <div ref={paneRef}>
          <ScrollPaneTop offsetHeight={paneOffset}>
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
    </div>
  );
};

export default AddressBook;
