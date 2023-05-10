import React, { useState } from "react";
import { withRouter, RouteComponentProps } from "react-router-dom";
import {
  AccordionItemButton,
  AccordionItem,
  AccordionItemHeading,
  AccordionItemPanel,
} from "react-accessible-accordion";
import styles from "../Addressbook.module.css";
import cstyles from "../../common/Common.module.css";
import { AddressBookEntry } from "../../appstate";
import { ZcashURITarget } from "../../../utils/uris";
import routes from "../../../constants/routes.json";
import Utils from "../../../utils/utils";
const { clipboard } = window.require("electron");

type AddressBookItemProps = {
  item: AddressBookEntry;
  removeAddressBookEntry: (label: string) => void;
  setSendTo: (targets: ZcashURITarget | ZcashURITarget[]) => void;
};

// Internal because we're using withRouter just below
const AddressBookItemInternal: React.FC<RouteComponentProps & AddressBookItemProps> = ({
  item,
  removeAddressBookEntry,
  setSendTo,
  history,
}) => {
  const [expandAddress, setExpandAddress] = useState(false); 
  
  return (
    <AccordionItem key={item.label} className={[cstyles.well, cstyles.margintopsmall].join(" ")} uuid={item.label}>
      <AccordionItemHeading>
        <AccordionItemButton className={cstyles.accordionHeader}>
          <div className={[cstyles.flexspacebetween].join(" ")}>
            <div>{item.label}</div>
            <div
              style={{ cursor: "pointer" }}
              onClick={() => {
                if (item.address) {
                  clipboard.writeText(item.address);
                  setExpandAddress(true);
                }
              }}>
              <div style={{ display: 'flex', flexDirection: 'column', flexWrap: 'wrap' }}>
                {!item.address && 'Unknown'}
                {!expandAddress && !!item.address && Utils.trimToSmall(item.address, 10)}
                {expandAddress && !!item.address && (
                  <>
                    {item.address.length < 80 ? item.address : Utils.splitStringIntoChunks(item.address, 3).map(item => <div key={item}>{item}</div>)}
                  </>
                )}
              </div>
            </div>
          </div>
        </AccordionItemButton>
      </AccordionItemHeading>
      <AccordionItemPanel>
        <div className={[cstyles.well, styles.addressbookentrybuttons].join(" ")}>
          <button
            type="button"
            className={cstyles.primarybutton}
            onClick={() => {
              setSendTo(new ZcashURITarget(item.address, undefined, undefined));
              history.push(routes.SEND);
            }}
          >
            Send To
          </button>
          <button type="button" className={cstyles.primarybutton} onClick={() => removeAddressBookEntry(item.label)}>
            Delete
          </button>
        </div>
      </AccordionItemPanel>
    </AccordionItem>
  );
};

const AddressBookItem = withRouter(AddressBookItemInternal);

export default AddressBookItem;