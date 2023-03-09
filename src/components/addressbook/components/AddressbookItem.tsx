import React from "react";
import { withRouter, RouteComponentProps } from "react-router-dom";
import {
  AccordionItemButton,
  AccordionItem,
  AccordionItemHeading,
  AccordionItemPanel,
} from "react-accessible-accordion";
import styles from "./Addressbook.module.css";
import cstyles from "./Common.module.css";
import { AddressBookEntry } from "../../appstate";
import { ZcashURITarget } from "../../../utils/uris";
import routes from "../../../constants/routes.json";

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
  return (
    <AccordionItem key={item.label} className={[cstyles.well, cstyles.margintopsmall].join(" ")} uuid={item.label}>
      <AccordionItemHeading>
        <AccordionItemButton className={cstyles.accordionHeader}>
          <div className={[cstyles.flexspacebetween].join(" ")}>
            <div>{item.label}</div>
            <div>{item.address}</div>
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