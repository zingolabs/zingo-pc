import { IRONWOOD_RECEIVER_LABEL } from "../../../constants/ironwood";
import React, { useState, useEffect, useContext, useRef, useMemo } from "react";
import {
  AccordionItem,
  AccordionItemHeading,
  AccordionItemButton,
  AccordionItemPanel,
  AccordionItemState,
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

import { useCopy } from "../../common/useCopy";
import { downloadQrCanvas, qrFileName } from "../../common/downloadQr";
import PaymentRequestModal from "./PaymentRequestModal";
import { faExternalLinkSquareAlt } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

type AddressBlockProps = {
  address: UnifiedAddressClass | TransparentAddressClass;
  label?: string;
  currencyName: string;
  type: "u" | "t";
  /** Where this address sits in the list on screen, and how long that list is. */
  position?: number;
  total?: number;
  calculateShieldFee?: () => Promise<number>;
  handleShieldButton?: () => void;
};

const AddressBlock: React.FC<AddressBlockProps> = ({
  address,
  label,
  currencyName,
  type,
  position,
  total,
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

  const { copied, copy } = useCopy(1500);
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

  // This block's own canvas. Looked up in the document, the first canvas on
  // the screen was saved whichever address was clicked.
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const handleQRCodeClick = () => downloadQrCanvas(qrCanvasRef.current, qrFileName(type, currentWallet?.alias));

  const [paymentRequestOpen, setPaymentRequestOpen] = useState<boolean>(false);

  const fullAddress: React.ReactNode =
    !!address_address && address_address.length < 80
      ? address_address
      : Utils.splitStringIntoChunks(address_address, 3).map((item) => <div key={item}>{item}</div>);

  return (
    <div>
      <AccordionItem key={copied ? 1 : 0} className={styles.receiveblock} uuid={address_address}>
        <AccordionItemHeading>
          {/* Indented to the column the open address heads, so folded and open
              addresses read down one line rather than two. */}
          <AccordionItemButton className={`${cstyles.accordionHeader} ${cstyles.marginleft}`}>
            {/* The address while folded, to tell the addresses apart. Open, it is
                shown once, heading the column beside the QR code; opening
                another address folds this one. */}
            <AccordionItemState>
              {({ expanded }) =>
                expanded ? null : (
                  <div className={cstyles.verticalflex}>
                    {/* Which of how many, so a long list says where you are in
                        it. On its own line, where the open address keeps it
                        beside the "Address" label, so both addresses start at
                        the same place. */}
                    {!!position && !!total && (
                      <div className={`${cstyles.sublight} ${cstyles.small}`}>{`${position} of ${total}`}</div>
                    )}
                    {fullAddress}
                  </div>
                )
              }
            </AccordionItemState>
          </AccordionItemButton>
        </AccordionItemHeading>
        <AccordionItemPanel className={styles.receiveDetail}>
          <div className={cstyles.flexspacebetween}>
            <div className={`${cstyles.verticalflex} ${cstyles.marginleft}`} style={{ flex: "1 1 auto", minWidth: 0 }}>
              <div>
                <div className={cstyles.sublight}>
                  Address
                  {!!position && !!total && <span>{` — ${position} of ${total}`}</span>}
                </div>
                <div className={`${cstyles.padtopsmall} ${cstyles.fixedfont}`}>{fullAddress}</div>
              </div>

              {label && (
                <div style={{ marginTop: 12 }}>
                  <div className={cstyles.sublight}>Label</div>
                  <div className={`${cstyles.padtopsmall} ${cstyles.fixedfont}`}>{label}</div>
                </div>
              )}

              {type === "u" && (
                <div style={{ marginTop: 12 }}>
                  {/* No gloss on the name any more. It was an info icon whose
                      tooltip explained that Ironwood is the shielded pool, from
                      when the name was new; by now it is the name of the pool,
                      and a circle with a question mark beside it only asks a
                      question the screen does not answer. */}
                  <div className={cstyles.sublight}>
                    Address type: {Utils.getReceivers(address as UnifiedAddressClass).join(" + ")}
                  </div>
                </div>
              )}

              {type === "t" && (
                <div style={{ marginTop: 12 }}>
                  <div className={cstyles.sublight}>Address type: Transparent</div>
                </div>
              )}

              {/* One row that wraps only when it must, rather than three buttons
                  each starting a line of its own at any width.

                  The buttons share the row's width equally. The row under this
                  one is a select, which grows to fill what is left, so it ran
                  to the edge of the column while this one stopped wherever its
                  three labels happened to end — two rows of actions, ragged
                  against each other. They end together now. */}
              <div
                className={cstyles.margintoplarge}
                style={{ display: "flex", flexWrap: "wrap", alignItems: "center" }}
              >
                <button
                  disabled={copied}
                  className={cstyles.primarybutton}
                  style={{ flex: "1 1 0", minWidth: 140 }}
                  type="button"
                  onClick={() => copy(address_address)}
                >
                  {copied ? <span>Copied!</span> : <span>Copy Address</span>}
                </button>

                <button
                  className={cstyles.primarybutton}
                  style={{ flex: "1 1 0", minWidth: 140 }}
                  type="button"
                  onClick={() => setPaymentRequestOpen(true)}
                >
                  Payment request
                </button>

                {currentWallet?.chain_name !== ServerChainNameEnum.regtestChainName && (
                  <button
                    className={cstyles.primarybutton}
                    style={{ flex: "1 1 0", minWidth: 140 }}
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
              </div>
              {/* The same row for both kinds of address; a unified one adds the
                  choice of receivers in front of the button, a transparent one
                  the shield action after it. */}
              <div
                className={cstyles.margintoplarge}
                style={{ display: "flex", flexWrap: "wrap", alignItems: "center" }}
              >
                {type === "u" && (
                  <select
                    aria-label="New address type"
                    className={cstyles.fieldselect}
                    // In line with the buttons above, which carry 8px each side.
                    style={{ marginLeft: 8 }}
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
                  className={cstyles.primarybutton}
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
                {/* Beside New Address rather than wrapping on to a row of its own
                    under the address actions. */}
                {type === "t" &&
                  totalBalance.confirmedTransparentBalance >= shieldFee &&
                  shieldFee > 0 &&
                  !readOnly &&
                  !anyPending && (
                    <button className={cstyles.primarybutton} type="button" onClick={handleShieldButton}>
                      Shield Balance (Fee: {shieldFee})
                    </button>
                  )}
              </div>
            </div>
            <div style={{ marginRight: 10, alignSelf: "center" }}>
              <button
                type="button"
                aria-label="Download QR code"
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "block" }}
                onClick={handleQRCodeClick}
              >
                {/*
                // @ts-ignore */}
                <QRCodeCanvas
                  ref={qrCanvasRef}
                  // Two modules of quiet zone instead of the standard four: the white band
                  // around the code took as much room as the code in a list of them, and
                  // readers manage with two on a screen. The saved image gets its own
                  // margin back (see composeQrWithTitle).
                  marginSize={2}
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
      {paymentRequestOpen && (
        <PaymentRequestModal
          address={address_address}
          allowsMemo={type === "u"}
          currencyName={currencyName}
          modalIsOpen={paymentRequestOpen}
          closeModal={() => setPaymentRequestOpen(false)}
        />
      )}
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
