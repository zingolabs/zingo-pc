import React, { useState, useEffect, useContext, useRef, useMemo } from "react";
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
import { ServerChainNameEnum, TransparentAddressClass, UnifiedAddressClass, ValueTransferClass } from "../../appstate";
import RPC from "../../../rpc/rpc";

import { clipboard } from "../../../electronBridge";

type AddressBlockProps = {
  address: UnifiedAddressClass | TransparentAddressClass;
  label?: string;
  currencyName: string;
  type: "u" | "t";
  calculateShieldFee?: () => Promise<number>;
  handleShieldButton?: () => void;
};

const AddressBlock: React.FC<AddressBlockProps> = ({
  address,
  label,
  currencyName,
  type,
  calculateShieldFee,
  handleShieldButton,
}) => {
  const context = useContext(ContextApp);
  const {
    readOnly,
    totalBalance,
    valueTransfers,
    openErrorModal,
    currentWallet,
    blockExplorerMainnetAddress,
    blockExplorerTestnetAddress,
    blockExplorerMainnetAddressCustom,
    blockExplorerTestnetAddressCustom,
  } = context;
  const address_address = address.encoded_address;

  const [copied, setCopied] = useState<boolean>(false);
  const [creating, setCreating] = useState<boolean>(false);
  const [shieldFee, setShieldFee] = useState<number>(0);

  const [unifiedCreateType, setUnifiedCreateType] = useState<"o" | "z" | "oz">("o");

  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const creatingTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    return () => {
      clearTimeout(copiedTimerRef.current);
      clearTimeout(creatingTimerRef.current);
    };
  }, []);

  const anyPending: boolean = useMemo(
    () => valueTransfers.some((vt: ValueTransferClass) => vt.confirmations >= 0 && vt.confirmations < 3),
    [valueTransfers],
  );

  useEffect(() => {
    if (
      type === "t" &&
      totalBalance.confirmedTransparentBalance > 0 &&
      calculateShieldFee &&
      !readOnly &&
      !anyPending
    ) {
      (async () => {
        setShieldFee(await calculateShieldFee());
      })();
    }
  }, [calculateShieldFee, address, anyPending, readOnly, totalBalance.confirmedTransparentBalance, type]);

  const handleQRCodeClick = async () => {
    const canvas: HTMLCanvasElement | null = document.querySelector("canvas");
    if (canvas) {
      const pngUrl = canvas.toDataURL("image/png").replace("image/png", "image/octet-stream");
      let downloadLink = document.createElement("a");
      downloadLink.href = pngUrl;
      downloadLink.download = "QR_" + type + "_Zingo_PC.png";
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    }
  };

  return (
    <div>
      <AccordionItem key={copied ? 1 : 0} className={[styles.receiveblock].join(" ")} uuid={address_address}>
        <AccordionItemHeading>
          <AccordionItemButton className={cstyles.accordionHeader}>
            <div className={[cstyles.verticalflex].join(" ")}>
              {!!address_address && address_address.length < 80
                ? address_address
                : Utils.splitStringIntoChunks(address_address, 3).map((item) => <div key={item}>{item}</div>)}
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

              {type === "u" && (
                <div>
                  <div className={[cstyles.sublight].join(" ")}>
                    Address type: {Utils.getReceivers(address as UnifiedAddressClass).join(" + ")}
                  </div>
                </div>
              )}

              {type === "t" && (
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
                    copiedTimerRef.current = setTimeout(() => setCopied(false), 5000);
                  }}
                >
                  {copied ? <span>Copied!</span> : <span>Copy Address</span>}
                </button>

                {currentWallet?.chain_name !== ServerChainNameEnum.regtestChainName && (
                  <button
                    className={[cstyles.primarybutton, cstyles.margintoplarge].join(" ")}
                    type="button"
                    onClick={() =>
                      Utils.openAddress(
                        address_address,
                        currentWallet?.chain_name,
                        currentWallet?.chain_name === ServerChainNameEnum.mainChainName
                          ? blockExplorerMainnetAddress
                          : blockExplorerTestnetAddress,
                        currentWallet?.chain_name === ServerChainNameEnum.mainChainName
                          ? blockExplorerMainnetAddressCustom
                          : blockExplorerTestnetAddressCustom,
                      )
                    }
                  >
                    View on explorer <i className={["fas", "fa-external-link-square-alt"].join(" ")} />
                  </button>
                )}
                {type === "t" &&
                  totalBalance.confirmedTransparentBalance >= shieldFee &&
                  shieldFee > 0 &&
                  !readOnly &&
                  !anyPending && (
                    <>
                      <button
                        className={[cstyles.primarybutton, cstyles.margintoplarge].join(" ")}
                        type="button"
                        onClick={handleShieldButton}
                      >
                        Shield Balance To Orchard (Fee: {shieldFee})
                      </button>
                    </>
                  )}
              </div>
              <div
                className={type === "u" ? cstyles.margintoplarge : undefined}
                style={{
                  borderWidth: type === "u" ? 1 : 0,
                  borderStyle: "solid",
                  borderColor: Utils.getCssVariable("--color-primary"),
                  paddingTop: 10,
                  paddingBottom: 10,
                }}
              >
                {type === "u" && (
                  <select
                    className={cstyles.inputbox}
                    style={{ marginLeft: 10 }}
                    value={unifiedCreateType}
                    onChange={(e) => {
                      setUnifiedCreateType(e.target.value as "o" | "z" | "oz");
                    }}
                  >
                    <option key="o" value="o">
                      Orchard
                    </option>
                    <option key="oz" value="oz">
                      Orchard+Sapling
                    </option>
                    <option key="z" value="z">
                      Sapling
                    </option>
                  </select>
                )}
                <button
                  disabled={creating}
                  className={[cstyles.primarybutton, cstyles.margintoplarge].join(" ")}
                  type="button"
                  onClick={async () => {
                    setCreating(true);
                    let result: string;
                    if (type === "t") {
                      result = await RPC.createNewAddressTransparent();
                    } else {
                      result = await RPC.createNewAddressUnified(unifiedCreateType);
                    }
                    if (!result || result.toLowerCase().startsWith("error")) {
                      openErrorModal("New Address", result ? result : "Error: creating a new address.");
                    }
                    creatingTimerRef.current = setTimeout(() => setCreating(false), 5000);
                  }}
                >
                  {creating ? <span>Creating...</span> : <span>New Address</span>}
                </button>
              </div>
            </div>
            <div style={{ marginRight: 10 }}>
              {/* 
              // @ts-ignore */}
              <QRCodeCanvas
                includeMargin={true}
                size={300}
                value={address_address}
                className={[styles.receiveQrcode].join(" ")}
                onClick={handleQRCodeClick}
              />
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", opacity: 0.5 }}>
                {"Click to download"}
              </div>
            </div>
          </div>
        </AccordionItemPanel>
      </AccordionItem>
      <div
        style={{
          height: 1,
          width: "98%",
          backgroundColor: Utils.getCssVariable("--color-primary"),
          alignSelf: "center",
          marginBottom: 10,
        }}
      />
    </div>
  );
};

export default AddressBlock;
