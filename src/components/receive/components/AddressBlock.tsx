import React, { useState, useEffect, useContext } from "react";
import {
  AccordionItem,
  AccordionItemHeading,
  AccordionItemButton,
  AccordionItemPanel,
} from "react-accessible-accordion";
import { QRCodeSVG } from "qrcode.react";
import styles from "../Receive.module.css";
import cstyles from "../../common/Common.module.css";
import Utils from "../../../utils/utils";
import { ContextApp } from "../../../context/ContextAppState";
import { AddressTransparentClass, AddressUnifiedClass } from "../../appstate";
import { AddressKindEnum } from "../../appstate/enums/AddressKindEnum";

const { clipboard } = window.require("electron");

type AddressBlockProps = {
  address: AddressUnifiedClass | AddressTransparentClass;
  label?: string;
  currencyName: string;
  zecPrice: number;
  calculateShieldFee?: () => Promise<number>;
  handleShieldButton: () => void;
};

const AddressBlock: React.FC<AddressBlockProps> = ({
  address,
  label,
  currencyName,
  zecPrice,
  calculateShieldFee,
  handleShieldButton
}) => {
  const context = useContext(ContextApp);
  const { readOnly } = context;
  const address_address = address.address;
  const balance = address.balance || 0;

  const [copied, setCopied] = useState<boolean>(false);
  const [timerID, setTimerID] = useState<NodeJS.Timeout | null>(null);
  const [shieldFee, setShieldFee] = useState<number>(0);
  const [anyPending, setAnyPending] = useState<boolean>(false);

  useEffect(() => {
    return () => {
      if (timerID) {
        clearTimeout(timerID);
      }
    };
  });

  //useEffect(() => {
  //  const _anyPending: Address | undefined = !!addresses && addresses.find((i: Address) => i.containsPending === true);
  //  setAnyPending(!!_anyPending);
  //}, [addresses]);

  useEffect(() => {
    if (address.addressKind === AddressKindEnum.transparent && calculateShieldFee && balance > 0 && !readOnly) {
      (async () => {
        setShieldFee(await calculateShieldFee());
      })();
    }
  }, [balance, calculateShieldFee, address.addressKind, anyPending, readOnly]);

  const handleQRCodeClick = async () => {
    console.log('____________ click processed');
    const canvas: HTMLCanvasElement | null = document.querySelector("canvas");
    if (canvas) {
      const pngUrl = canvas
        .toDataURL("image/png")
        .replace("image/png", "image/octet-stream");
    let downloadLink = document.createElement("a");
    downloadLink.href = pngUrl;
    downloadLink.download = "QR_" + 
                            (address.addressKind === AddressKindEnum.unified ? 'UA' : 'T') + 
                            "_Zingo_PC.png";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    }
  }

  return (
    <AccordionItem key={copied ? 1 : 0} className={[cstyles.well, styles.receiveblock].join(" ")} uuid={address_address}>
      <AccordionItemHeading>
        <AccordionItemButton className={cstyles.accordionHeader}>
          <div className={[cstyles.verticalflex].join(" ")}>
            {address_address.length < 80 ? address_address : Utils.splitStringIntoChunks(address_address, 3).map(item => <div key={item}>{item}</div>)}
          </div>
        </AccordionItemButton>
      </AccordionItemHeading>
      <AccordionItemPanel className={[styles.receiveDetail].join(" ")}>
        <div className={[cstyles.flexspacebetween].join(" ")}>
          <div className={[cstyles.verticalflex, cstyles.marginleft].join(" ")}>
            {label && (
              <div className={cstyles.margintoplarge}>
                <div className={[cstyles.sublight].join(" ")}>Label</div>
                <div className={[cstyles.padtopsmall, cstyles.fixedfont].join(" ")}>{label}</div>
              </div>
            )}

            {address.addressKind === AddressKindEnum.unified && (
              <div className={cstyles.margintoplarge}>
                <div className={[cstyles.sublight].join(" ")}>Address types: {Utils.getReceivers(address).join(" + ")}</div>
              </div>
            )}

            {address.addressKind === AddressKindEnum.transparent && (
              <div className={cstyles.margintoplarge}>
                <div className={[cstyles.sublight].join(" ")}>Address type: Transparent</div>
              </div>
            )}

            <div className={[cstyles.sublight, cstyles.margintoplarge].join(" ")}>Funds</div>
            <div className={[cstyles.padtopsmall].join(" ")}>
              {currencyName} {balance}
            </div>
            <div className={[cstyles.padtopsmall].join(" ")}>{Utils.getZecToUsdString(zecPrice, balance)}</div>

            <div>
              <button
                className={[cstyles.primarybutton, cstyles.margintoplarge].join(" ")}
                type="button"
                onClick={() => {
                  clipboard.writeText(address_address);
                  setCopied(true);
                  setTimerID(setTimeout(() => setCopied(false), 5000));
                }}
              >
                {copied ? <span>Copied!</span> : <span>Copy Address</span>}
              </button>

              <button className={[cstyles.primarybutton, cstyles.margintoplarge].join(" ")} type="button" onClick={() => Utils.openAddress(address_address, currencyName)}>
                View on explorer <i className={["fas", "fa-external-link-square-alt"].join(" ")} />
              </button>
              {address.addressKind === AddressKindEnum.transparent && balance >= shieldFee && shieldFee > 0 && !readOnly && (
                <>
                  <button className={[cstyles.primarybutton, cstyles.margintoplarge].join(" ")} type="button" onClick={handleShieldButton}>
                    Shield Balance To Orchard (Fee: {shieldFee})
                  </button>
                </>
              )}
            </div>
          </div>
          <div>
            {/*
            // @ts-ignore */}
            <QRCodeSVG includeMargin={true} size={300} value={address_address} className={[styles.receiveQrcode].join(" ")} onClick={handleQRCodeClick} />
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', opacity: 0.5 }}>{'Click to download'}</div>
          </div>
        </div>
      </AccordionItemPanel>
    </AccordionItem>
  );
};

export default AddressBlock;
