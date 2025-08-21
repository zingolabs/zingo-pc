import React, { useState, useEffect, useContext } from "react";
import {
  AccordionItem,
  AccordionItemHeading,
  AccordionItemButton,
  AccordionItemPanel,
} from "react-accessible-accordion";
import { QRCodeCanvas } from "qrcode.react";
import styles from "../Receive.module.css";
import cstyles from "../../common/Common.module.css";
import Utils from "../../../utils/utils";
import { ContextApp } from "../../../context/ContextAppState";
import { TransparentAddressClass, UnifiedAddressClass, ValueTransferClass } from "../../appstate";
import RPC from "../../../rpc/rpc";

const { clipboard } = window.require("electron");

type AddressBlockProps = {
  address: UnifiedAddressClass | TransparentAddressClass;
  label?: string;
  currencyName: string;
  type: 'u' | 't';
  openErrorModal: (title: string, body: string | JSX.Element) => void;
  calculateShieldFee?: () => Promise<number>;
  handleShieldButton?: () => void;
};

const AddressBlock: React.FC<AddressBlockProps> = ({
  address,
  label,
  currencyName,
  type,
  openErrorModal,
  calculateShieldFee,
  handleShieldButton
}) => {
  const context = useContext(ContextApp);
  const { readOnly, totalBalance, valueTransfers } = context;
  const address_address = address.encoded_address;

  const [copied, setCopied] = useState<boolean>(false);
  const [creating, setCreating] = useState<boolean>(false);
  const [shieldFee, setShieldFee] = useState<number>(0);
  const [anyPending, setAnyPending] = useState<boolean>(false);

  const [unifiedCreateType, setUnifiedCreateType] = useState<'o' | 'z' | 'oz'>('o');

  useEffect(() => {
    // set somePending as well here when I know there is something new in ValueTransfers
    const pending: number =
      valueTransfers.length > 0 ? valueTransfers.filter((vt: ValueTransferClass) => vt.confirmations >= 0 && vt.confirmations < 3).length : 0;
    setAnyPending(pending > 0);
  }, [valueTransfers]);

  useEffect(() => {
    if (type === 't' && calculateShieldFee && totalBalance.confirmedTransparentBalance > 0 && !readOnly && !anyPending) {
      (async () => {
        setShieldFee(await calculateShieldFee());
      })();
    }
  }, [calculateShieldFee, address, anyPending, readOnly, totalBalance.confirmedTransparentBalance, type]);

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
                            type + 
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
            {!!address_address && address_address.length < 80 ? address_address : Utils.splitStringIntoChunks(address_address, 3).map(item => <div key={item}>{item}</div>)}
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

            {type === 'u' && (
              <div>
                <div className={[cstyles.sublight].join(" ")}>Address type: {Utils.getReceivers(address as UnifiedAddressClass).join(" + ")}</div>
              </div>
            )}

            {type === 't' && (
              <div>
                <div className={[cstyles.sublight].join(" ")}>Address type: Transparent</div>
              </div>
            )}

            <div>
              <button
                disabled={copied}
                className={[cstyles.primarybutton, cstyles.margintoplarge].join(" ")}
                type="button"
                onClick={() => {
                  setCopied(true);
                  clipboard.writeText(address_address);
                  setTimeout(() => setCopied(false), 5000);
                }}
              >
                {copied ? <span>Copied!</span> : <span>Copy Address</span>}
              </button>

              <button className={[cstyles.primarybutton, cstyles.margintoplarge].join(" ")} type="button" onClick={() => Utils.openAddress(address_address, currencyName)}>
                View on explorer <i className={["fas", "fa-external-link-square-alt"].join(" ")} />
              </button>
              {type === 't' && totalBalance.confirmedTransparentBalance >= shieldFee && shieldFee > 0 && !readOnly && !anyPending && (
                <>
                  <button className={[cstyles.primarybutton, cstyles.margintoplarge].join(" ")} type="button" onClick={handleShieldButton}>
                    Shield Balance To Orchard (Fee: {shieldFee})
                  </button>
                </>
              )}
            </div>
            <div 
              className={type === 'u' ? cstyles.margintoplarge : undefined}
              style={{ borderWidth: type === 'u' ? 1: 0, borderStyle: 'solid', borderColor: Utils.getCssVariable('--color-primary'), paddingTop: 10, paddingBottom: 10 }}>
              {type === 'u' && ( 
                <select
                  className={cstyles.inputbox}
                  style={{ marginLeft: 10 }}
                  value={unifiedCreateType}
                  onChange={(e) => {
                    setUnifiedCreateType(e.target.value as 'o' | 'z' | 'oz');
                  }}>
                    <option key="o" value="o">Orchard</option>
                    <option key="oz" value="oz">Orchard+Sapling</option>
                    <option key="z" value="z">Sapling</option>
                </select>
              )}
              <button
                disabled={creating}
                className={[cstyles.primarybutton, cstyles.margintoplarge].join(" ")}
                type="button"
                onClick={async () => {
                  setCreating(true);
                  let result: string;
                  if (type === 't') {
                    result = await RPC.createNewAddressTransparent();
                  } else {
                    result = await RPC.createNewAddressUnified(unifiedCreateType)
                  }
                  if (!result || result.toLowerCase().startsWith('error')) {
                    openErrorModal("New Address", result ? result : "Error: creating a new address.")
                  }
                  setTimeout(() => setCreating(false), 5000);
                }}
              >
                {creating ? <span>Creating...</span> : <span>New Address</span>}
              </button>
            </div>
          </div>
          <div>
            {/*
            // @ts-ignore */}
            <QRCodeCanvas includeMargin={true} size={300} value={address_address} className={[styles.receiveQrcode].join(" ")} onClick={handleQRCodeClick} />
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', opacity: 0.5 }}>{'Click to download'}</div>
          </div>
        </div>
      </AccordionItemPanel>
    </AccordionItem>
  );
};

export default AddressBlock;
