import { IRONWOOD_RECEIVER_LABEL, IRONWOOD_RECEIVER_TOOLTIP } from "../../../constants/ironwood";
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
import {
  ServerChainNameEnum,
  TransparentAddressClass,
  UnifiedAddressClass,
  ValueTransferClass,
  ValueTransferStatusEnum,
} from "../../appstate";
import RPC from "../../../rpc/rpc";

import { ipcRenderer, isSandboxed } from "../../../electronBridge";
import { useCopy } from "../../common/useCopy";
import { faExternalLinkSquareAlt, faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

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

  const { copied, copy } = useCopy(5000);
  const [creating, setCreating] = useState<boolean>(false);
  const [shieldFee, setShieldFee] = useState<number>(0);

  const [unifiedCreateType, setUnifiedCreateType] = useState<"o" | "z" | "oz">("o");

  const creatingTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    return () => {
      clearTimeout(creatingTimerRef.current);
    };
  }, []);

  const anyPending: boolean = useMemo(
    () =>
      valueTransfers
        .filter((vt: ValueTransferClass) => vt.status !== ValueTransferStatusEnum.failed)
        .some((vt: ValueTransferClass) => vt.confirmations >= 0 && vt.confirmations < 3),
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
    if (!canvas) return;
    // Append the wallet alias so users with multiple wallets can tell the QR
    // files apart at a glance. Strip filesystem-unfriendly characters.
    const walletSuffix = currentWallet?.alias ? "_" + currentWallet.alias.replace(/[\\/:*?"<>|]/g, "_") : "";
    const suggestedName = "QR_" + type + "_Zingo_PC" + walletSuffix + ".png";

    // MAS sandbox can't write to the Downloads folder without the
    // `files.downloads.read-write` entitlement (which Apple flagged as unused
    // under 2.4.5(i)). Route through the main-process save dialog instead —
    // that uses the `files.user-selected.read-write` entitlement we already
    // declare and lets the user pick any location.
    if (isSandboxed) {
      const dataUrl = canvas.toDataURL("image/png");
      await ipcRenderer.invoke("save-png", { dataUrl, suggestedName });
      return;
    }

    // Non-MAS builds (DMG / Linux / Windows) still use the native browser
    // download flow — it lands in ~/Downloads (or the OS default) without a
    // prompt, which is the long-standing UX.
    const pngUrl = canvas.toDataURL("image/png").replace("image/png", "image/octet-stream");
    let downloadLink = document.createElement("a");
    downloadLink.href = pngUrl;
    downloadLink.download = suggestedName;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  };

  return (
    <div>
      <AccordionItem key={copied ? 1 : 0} className={styles.receiveblock} uuid={address_address}>
        <AccordionItemHeading>
          <AccordionItemButton className={cstyles.accordionHeader}>
            <div className={cstyles.verticalflex}>
              {!!address_address && address_address.length < 80
                ? address_address
                : Utils.splitStringIntoChunks(address_address, 3).map((item) => <div key={item}>{item}</div>)}
            </div>
          </AccordionItemButton>
        </AccordionItemHeading>
        <AccordionItemPanel className={styles.receiveDetail}>
          <div className={cstyles.flexspacebetween}>
            <div className={`${cstyles.verticalflex} ${cstyles.marginleft}`}>
              {label && (
                <div style={{ marginTop: 12 }}>
                  <div className={cstyles.sublight}>Label</div>
                  <div className={`${cstyles.padtopsmall} ${cstyles.fixedfont}`}>{label}</div>
                </div>
              )}

              {type === "u" && (
                <div style={{ marginTop: 12 }}>
                  <div className={cstyles.sublight}>
                    Address type: {Utils.getReceivers(address as UnifiedAddressClass).join(" + ")}
                    {/* Only where the gloss appears. A Sapling-only address says
                        nothing about Ironwood, so it gets nothing to explain. */}
                    {(address as UnifiedAddressClass).has_orchard && (
                      <FontAwesomeIcon
                        icon={faInfoCircle}
                        title={IRONWOOD_RECEIVER_TOOLTIP}
                        style={{ marginLeft: 6, cursor: "help", opacity: 0.8 }}
                      />
                    )}
                  </div>
                </div>
              )}

              {type === "t" && (
                <div style={{ marginTop: 12 }}>
                  <div className={cstyles.sublight}>Address type: Transparent</div>
                </div>
              )}

              <div>
                <button
                  disabled={copied}
                  className={`${cstyles.primarybutton} ${cstyles.margintoplarge}`}
                  type="button"
                  onClick={() => copy(address_address)}
                >
                  {copied ? <span>Copied!</span> : <span>Copy Address</span>}
                </button>

                {currentWallet?.chain_name !== ServerChainNameEnum.regtestChainName && (
                  <button
                    className={`${cstyles.primarybutton} ${cstyles.margintoplarge}`}
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
                    View on explorer <FontAwesomeIcon icon={faExternalLinkSquareAlt} />
                  </button>
                )}
                {type === "t" &&
                  totalBalance.confirmedTransparentBalance >= shieldFee &&
                  shieldFee > 0 &&
                  !readOnly &&
                  !anyPending && (
                    <>
                      <button
                        className={`${cstyles.primarybutton} ${cstyles.margintoplarge}`}
                        type="button"
                        onClick={handleShieldButton}
                      >
                        Shield Balance (Fee: {shieldFee})
                      </button>
                    </>
                  )}
              </div>
              <div
                className={type === "u" ? cstyles.margintoplarge : undefined}
                style={{
                  borderWidth: type === "u" ? 1 : 0,
                  borderStyle: "solid",
                  borderColor: "var(--color-primary)",
                  paddingTop: 10,
                  paddingBottom: 10,
                }}
              >
                {type === "u" && (
                  <select
                    aria-label="New address type"
                    className={cstyles.fieldinput}
                    style={{ marginLeft: 10, borderRadius: 12, border: "1px solid var(--color-zingo)" }}
                    value={unifiedCreateType}
                    onChange={(e) => {
                      setUnifiedCreateType(e.target.value as "o" | "z" | "oz");
                    }}
                  >
                    <option key="o" value="o">
                      {IRONWOOD_RECEIVER_LABEL}
                    </option>
                    <option key="oz" value="oz">
                      {`${IRONWOOD_RECEIVER_LABEL} + Sapling`}
                    </option>
                    <option key="z" value="z">
                      Sapling
                    </option>
                  </select>
                )}
                <button
                  disabled={creating}
                  className={`${cstyles.primarybutton} ${cstyles.margintoplarge}`}
                  type="button"
                  onClick={async () => {
                    setCreating(true);
                    try {
                      // Throws on failure; the address list refreshes via sync.
                      if (type === "t") {
                        await RPC.createNewAddressTransparent();
                      } else {
                        await RPC.createNewAddressUnified(unifiedCreateType);
                      }
                    } catch (error) {
                      openErrorModal("New Address", `${error}`);
                    }
                    creatingTimerRef.current = setTimeout(() => setCreating(false), 5000);
                  }}
                >
                  {creating ? <span>Creating...</span> : <span>New Address</span>}
                </button>
              </div>
            </div>
            <div style={{ marginRight: 10 }}>
              <button
                type="button"
                aria-label="Download QR code"
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "block" }}
                onClick={handleQRCodeClick}
              >
                {/*
                // @ts-ignore */}
                <QRCodeCanvas
                  includeMargin={true}
                  size={300}
                  value={address_address}
                  className={styles.receiveQrcode}
                />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    color: "var(--color-zingo)",
                  }}
                >
                  {"Click to download"}
                </div>
              </button>
            </div>
          </div>
        </AccordionItemPanel>
      </AccordionItem>
      <div
        style={{
          height: 1,
          width: "98%",
          backgroundColor: "var(--color-primary)",
          alignSelf: "center",
          marginBottom: 10,
        }}
      />
    </div>
  );
};

export default AddressBlock;
