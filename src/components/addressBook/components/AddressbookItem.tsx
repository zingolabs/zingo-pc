import React, { useContext, useState } from "react";
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
import { isZnsAlias } from "../../../utils/zns";
import { useCopy } from "../../common/useCopy";
import { chainDisplayName } from "../../swap/chainDisplayName";
import { ChainBadge } from "../../common/ChainBadge";

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
  const [expandAddress, setExpandAddress] = useState<boolean>(false);
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

  return (
    <AccordionItem
      key={item.label.replace(/\s/g, "")}
      className={`${cstyles.well} ${cstyles.margintopsmall}`}
      uuid={item.label.replace(/\s/g, "")}
    >
      <AccordionItemHeading>
        <AccordionItemButton className={cstyles.accordionHeader}>
          <div className={cstyles.flexspacebetween}>
            {/* The badge leads, so the chain reads off the list without the
                bracketed tag having to be found and parsed on every row. */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <ChainBadge chain={swapChain} size={24} />
              {item.label}
              {/* Which chain the address belongs to is the first thing that
                  matters now that the book holds more than Zcash, so a non-ZEC
                  contact always says so. The Zcash network only appears
                  alongside it when the parent is showing every network, which
                  is the only time it is ambiguous. */}
              {!isZecContact && (
                <span className={`${cstyles.small} ${cstyles.sublight}`} style={{ marginLeft: 8 }}>
                  [{chainDisplayName(swapChain) || swapChain}]
                </span>
              )}
              {isZecContact && showChain && item.chain && (
                <span className={`${cstyles.small} ${cstyles.sublight}`} style={{ marginLeft: 8 }}>
                  [{Utils.chainDisplayName(item.chain)}]
                </span>
              )}
            </div>
            {!!item.address && (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                {copied && <span className={cstyles.highlight}>Copied!</span>}
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Copy address"
                  style={{ cursor: "pointer" }}
                  onClick={() => {
                    if (item.address) {
                      copy(item.address);
                      setExpandAddress(true);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (item.address) {
                        copy(item.address);
                        setExpandAddress(true);
                      }
                    }
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", flexWrap: "wrap" }}>
                    {/* ZNS aliases are short and human-readable — show them in full
                      without any trimming, both collapsed and expanded. */}
                    {isZnsAlias(item.address) ? (
                      item.address
                    ) : (
                      <>
                        {!expandAddress && Utils.trimToSmall(item.address, 10)}
                        {expandAddress && (
                          <>
                            {item.address.length < 80
                              ? item.address
                              : Utils.splitStringIntoChunks(item.address, 3).map((item) => (
                                  <div key={item}>{item}</div>
                                ))}
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
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
