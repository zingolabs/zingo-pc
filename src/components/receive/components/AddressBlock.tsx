import React, { useState, useEffect, useContext } from "react";
import {
  AccordionItem,
  AccordionItemHeading,
  AccordionItemButton,
  AccordionItemPanel,
} from "react-accessible-accordion";
import QRCode from "qrcode.react";
import styles from "../Receive.module.css";
import cstyles from "../../common/Common.module.css";
import Utils from "../../../utils/utils";
import { Address, AddressType } from "../../appstate";
import { ContextApp } from "../../../context/ContextAppState";

const { clipboard } = window.require("electron");

type AddressBlockProps = {
  address: Address;
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
  const { readOnly, addresses } = context;
  const { receivers, type } = address;
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

  useEffect(() => {
    const _anyPending: Address | undefined = !!addresses && addresses.find((i: Address) => i.containsPending === true);
    setAnyPending(!!_anyPending);
  }, [addresses]);

  useEffect(() => {
    if (type === AddressType.transparent && calculateShieldFee && balance > 0) {
      (async () => {
        setShieldFee(await calculateShieldFee());
      })();
    }
  }, [balance, calculateShieldFee, type, anyPending]);

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
                            (type === AddressType.unified ? 'UA' : type === AddressType.sapling ? 'Z' : 'T') + 
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

            {type === AddressType.unified && !!receivers && (
              <div className={cstyles.margintoplarge}>
                <div className={[cstyles.sublight].join(" ")}>Address types: {Utils.getReceivers(receivers).join(" + ")}</div>
              </div>
            )}

            {type === AddressType.sapling && (
              <div className={cstyles.margintoplarge}>
                <div className={[cstyles.sublight].join(" ")}>Address type: Sapling</div>
              </div>
            )}

            {type === AddressType.transparent && (
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
              {type === AddressType.transparent && balance >= shieldFee && shieldFee > 0 && !readOnly && (
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
            <QRCode includeMargin={true} size={300} value={address_address} className={[styles.receiveQrcode].join(" ")} onClick={handleQRCodeClick} />
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', opacity: 0.5 }}>{'Click to download'}</div>
          </div>
        </div>
      </AccordionItemPanel>
    </AccordionItem>
  );
};

export default AddressBlock;
