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
import { AddressBookEntryClass } from "../../appstate";
import { ZcashURITarget } from "../../../utils/uris";
import routes from "../../../constants/routes.json";
import Utils from "../../../utils/utils";
import { ContextApp } from "../../../context/ContextAppState";
import { clipboard } from "../../../electronBridge";
import { isZnsAlias } from "../../../utils/zns";

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
  const { readOnly, setSendTo, currentWallet } = context;
  const [expandAddress, setExpandAddress] = useState<boolean>(false);

  // "Send To" only makes sense when the active wallet is on the same network as
  // the contact — sending a mainnet address from a testnet wallet would fail.
  // The entry is still visible (when "Show all networks" is enabled) but the
  // action is hidden to avoid mistakes.
  const sendIsAvailable = !!currentWallet && currentWallet.chain_name === item.chain;

  return (
    <AccordionItem
      key={item.label.replace(/\s/g, "")}
      className={`${cstyles.well} ${cstyles.margintopsmall}`}
      uuid={item.label.replace(/\s/g, "")}
    >
      <AccordionItemHeading>
        <AccordionItemButton className={cstyles.accordionHeader}>
          <div className={cstyles.flexspacebetween}>
            <div>
              {item.label}
              {showChain && item.chain && (
                <span className={`${cstyles.small} ${cstyles.sublight}`} style={{ marginLeft: 8 }}>
                  [{Utils.chainDisplayName(item.chain)}]
                </span>
              )}
            </div>
            {!!item.address && (
              <div
                role="button"
                tabIndex={0}
                aria-label="Copy address"
                style={{ cursor: "pointer" }}
                onClick={() => {
                  if (item.address) {
                    clipboard.writeText(item.address);
                    setExpandAddress(true);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (item.address) {
                      clipboard.writeText(item.address);
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
                            : Utils.splitStringIntoChunks(item.address, 3).map((item) => <div key={item}>{item}</div>)}
                        </>
                      )}
                    </>
                  )}
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
          <button type="button" className={cstyles.primarybutton} onClick={() => removeAddressBookEntry(item.label)}>
            Delete
          </button>
        </div>
      </AccordionItemPanel>
    </AccordionItem>
  );
};

export default AddressBookItemInternal;
