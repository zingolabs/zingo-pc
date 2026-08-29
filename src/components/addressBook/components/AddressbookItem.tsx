import React, { useContext } from "react";
import { useNavigate } from "react-router-dom";
import {
  AccordionItemButton,
  AccordionItem,
  AccordionItemHeading,
  AccordionItemPanel,
} from "react-accessible-accordion";
import styles from "../Addressbook.module.css";
import cstyles from "../../common/Common.module.css";
import { AddressBookEntryClass, ServerChainNameEnum, ZEC_SWAP_CHAIN } from "../../appstate";
import { ZcashURITarget } from "../../../utils/uris";
import routes from "../../../constants/routes.json";
import Utils from "../../../utils/utils";
import { ContextApp } from "../../../context/ContextAppState";
import { useCopy } from "../../common/useCopy";
import { chainDisplayName } from "../../swap/chainDisplayName";
import { CopyField, Field, FieldRow } from "../../swap/DetailField";

type AddressBookItemProps = {
  item: AddressBookEntryClass;
  removeAddressBookEntry: (label: string) => void;
  // When true (parent shows "all networks"), the entry shows its chain inline
  // so the user can tell mainnet/testnet/regtest contacts apart at a glance.
  showChain?: boolean;
};

const AddressBookItemInternal: React.FC<AddressBookItemProps> = ({ item, removeAddressBookEntry, showChain }) => {
  const navigate = useNavigate();
  const context = useContext(ContextApp);
  const { readOnly, setSendTo, setSwapTo, currentWallet } = context;
  const { copied, copy } = useCopy(1500);

  // A contact written before the field existed is a Zcash one: there was no way
  // to store anything else. The read migration stamps them, so this is only the
  // belt to that braces.
  const swapChain = item.swapChain ?? ZEC_SWAP_CHAIN;
  const isZecContact = swapChain === ZEC_SWAP_CHAIN;

  // "Send To" only makes sense when the active wallet is on the same network as
  // the contact — sending a mainnet address from a testnet wallet would fail.
  // The entry is still visible (when "Show all networks" is enabled) but the
  // action is hidden to avoid mistakes. A non-ZEC contact is never sendable
  // from here: this wallet holds no BTC to send.
  const sendIsAvailable = isZecContact && !!currentWallet && currentWallet.chain_name === item.chain;

  // The mirror image: only a non-ZEC contact can be the far side of a swap,
  // since ZEC is the fixed near side of every swap this wallet performs. Swaps
  // are mainnet-only, which is the same gate the menu entry uses.
  const swapIsAvailable = !isZecContact && !readOnly && currentWallet?.chain_name === ServerChainNameEnum.mainChainName;

  // Which chain the address belongs to, which is the first thing that matters
  // now that the book holds more than Zcash. A Zcash contact names its network
  // too, but only while the parent is showing every network — that is the only
  // time mainnet and testnet contacts sit in one list and the entry is
  // ambiguous without it.
  const chainLabel =
    isZecContact && showChain && item.chain
      ? `${chainDisplayName(swapChain) || swapChain} — ${Utils.chainDisplayName(item.chain)}`
      : chainDisplayName(swapChain) || swapChain;

  return (
    <AccordionItem
      key={item.label.replace(/\s/g, "")}
      className={`${cstyles.well} ${cstyles.margintopsmall}`}
      uuid={item.label.replace(/\s/g, "")}
    >
      <AccordionItemHeading>
        <AccordionItemButton className={cstyles.accordionHeader}>
          {/* The address leads, because it is what the entry is. The name
              somebody gave it and the chain it sits on describe it, and read
              underneath in the shape every other detail in the app uses.
              Shown in full: the entry used to open on a click to reveal the
              rest, which cost a click to read a value that fits. */}
          {!!item.address && <CopyField label="Address" value={item.address} copy={copy} />}
          <FieldRow>
            <Field label="Label" value={item.label} />
            <Field label="Chain" value={chainLabel} />
          </FieldRow>
          {copied && <div className={`${cstyles.small} ${cstyles.highlight}`}>Copied!</div>}
        </AccordionItemButton>
      </AccordionItemHeading>
      <AccordionItemPanel>
        <div className={`${cstyles.well} ${styles.addressbookentrybuttons}`}>
          {!readOnly && sendIsAvailable && (
            <button
              type="button"
              className={cstyles.primarybutton}
              onClick={() => {
                setSendTo(new ZcashURITarget(item.address, undefined, undefined));
                navigate(routes.SEND);
              }}
            >
              Send To
            </button>
          )}
          {swapIsAvailable && (
            <button
              type="button"
              className={cstyles.primarybutton}
              onClick={() => {
                setSwapTo({ address: item.address, swapChain });
                navigate(routes.SWAP);
              }}
            >
              Swap To
            </button>
          )}
          <button type="button" className={cstyles.primarybutton} onClick={() => removeAddressBookEntry(item.label)}>
            Delete
          </button>
        </div>
      </AccordionItemPanel>
    </AccordionItem>
  );
};

export default AddressBookItemInternal;
