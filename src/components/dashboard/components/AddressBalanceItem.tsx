import {
  AccordionItemButton,
  AccordionItem,
  AccordionItemHeading,
  AccordionItemPanel,
} from "react-accessible-accordion";
import styles from "../Dashboard.module.css";
import cstyles from "../../common/Common.module.css";
import { Address, AddressType } from "../../appstate";
import Utils from "../../../utils/utils"; 
import { useState } from "react";
const { clipboard } = window.require("electron");

type AddressBalanceItemProps = {
  currencyName: string;
  zecPrice: number;
  item: Address; 
};

const AddressBalanceItem: React.FC<AddressBalanceItemProps> = ({ currencyName, zecPrice, item }) => {
  const [expandAddress, setExpandAddress] = useState<boolean>(false);

  const { bigPart, smallPart }: {bigPart: string, smallPart: string} = Utils.splitZecAmountIntoBigSmall(Math.abs(item.balance));

  if (!item.address) return null;
  
  return (
    <AccordionItem key={item.address} className={[cstyles.well, cstyles.margintopsmall].join(" ")} uuid={item.address}>
      <AccordionItemHeading>
        <AccordionItemButton className={cstyles.accordionHeader}>
          <div className={[cstyles.flexspacebetween].join(" ")}>
            <div>
              <div className={[cstyles.verticalflex].join(" ")}>
                <div
                  style={{ cursor: "pointer" }}
                  onClick={() => {
                    if (item.address) {
                      clipboard.writeText(item.address);
                      setExpandAddress(true);
                    }
                  }}>
                  <div style={{ display: 'flex', flexDirection: 'column', flexWrap: 'wrap' }}>
                    {!expandAddress && !!item.address && Utils.trimToSmall(item.address, 10)}
                    {expandAddress && !!item.address && (
                      <>
                        {item.address.length < 80 ? item.address : Utils.splitStringIntoChunks(item.address, 3).map(item => <div key={item}>{item}</div>)}
                      </>
                    )}
                  </div>
                </div>
              </div>
              {item.type === AddressType.unified && !!item.receivers && (
                <div className={[cstyles.small, cstyles.padtopsmall, cstyles.sublight].join(" ")}>
                  Address types: {Utils.getReceivers(item.receivers).join(" + ")}
                </div>
              )}
              {item.type === AddressType.sapling && (
                <div className={[cstyles.small, cstyles.padtopsmall, cstyles.sublight].join(" ")}>
                  Address type: Sapling
                </div>
              )}
              {item.type === AddressType.transparent && (
                <div className={[cstyles.small, cstyles.padtopsmall, cstyles.sublight].join(" ")}>
                  Address type: Transparent
                </div>
              )}              
              {item.containsPending && (
                <div className={[cstyles.red, cstyles.small, cstyles.padtopsmall].join(" ")}>
                  Some transactions are pending. Balances may change.
                </div>
              )}
            </div>
            <div className={[styles.txamount, cstyles.right].join(" ")}>
              <div>
                <span>
                  {currencyName} {bigPart}
                </span>
                <span className={[cstyles.small, cstyles.zecsmallpart].join(" ")}>{smallPart}</span>
              </div>
              <div className={[cstyles.sublight, cstyles.small, cstyles.padtopsmall].join(" ")}>
                {Utils.getZecToUsdString(zecPrice, Math.abs(item.balance))}
              </div>
            </div>
          </div>
        </AccordionItemButton>
      </AccordionItemHeading>
      <AccordionItemPanel />
    </AccordionItem>
  );
};

export default AddressBalanceItem;
