import React, { useContext, useRef, useState } from "react";
import Modal from "react-modal";
import { QRCodeCanvas } from "qrcode.react";

import cstyles from "../../common/Common.module.css";
import swapStyles from "../../swap/Swap.module.css";
import styles from "../Receive.module.css";
import { ContextApp } from "../../../context/ContextAppState";
import { useCopy } from "../../common/useCopy";
import { downloadQrCanvas, qrFileName } from "../../common/downloadQr";
import {
  PAYMENT_REQUEST_MEMO_MAX_BYTES,
  buildPaymentRequestUri,
  validatePaymentRequest,
} from "../../../utils/paymentRequest";

type PaymentRequestModalProps = {
  /** The address being asked to be paid. */
  address: string;
  /** Whether it can receive a memo: a shielded address can, a transparent one cannot. */
  allowsMemo: boolean;
  currencyName: string;
  modalIsOpen: boolean;
  closeModal: () => void;
};

/**
 * Asks to be paid a set amount, with a memo, at one of this wallet's
 * addresses. The request is a ZIP 321 `zcash:` link: shown as a QR to scan,
 * saved as an image like the other QR codes, or copied whole to send to the
 * payer, whose wallet opens it with everything filled in.
 *
 * Nothing leaves the wallet. The link is built here and handed to the user.
 */
const PaymentRequestModal: React.FC<PaymentRequestModalProps> = ({
  address,
  allowsMemo,
  currencyName,
  modalIsOpen,
  closeModal,
}) => {
  const { currentWallet } = useContext(ContextApp);
  const [amount, setAmount] = useState<string>("");
  const [memo, setMemo] = useState<string>("");
  // The link as it was generated. Editing a field drops it, so the code on the
  // right never shows a request the fields no longer say.
  const [uri, setUri] = useState<string | null>(null);
  const [touched, setTouched] = useState<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { copied, copy } = useCopy(1500);

  const { amountError, memoError } = validatePaymentRequest({ amount, memo, allowsMemo });
  const valid = !amountError && !memoError;
  const memoBytesUsed = new TextEncoder().encode(memo).length;

  const generate = () => {
    setTouched(true);
    if (!valid) return;
    setUri(buildPaymentRequestUri({ address, amount, memo }));
  };

  return (
    <Modal
      isOpen={modalIsOpen}
      onRequestClose={closeModal}
      className={swapStyles.narrowmodal}
      style={{ content: { ["--swap-modal-width" as string]: "780px" } }}
      overlayClassName={cstyles.modalOverlay}
    >
      <div className={cstyles.verticalflex}>
        <div className={`${cstyles.center} ${cstyles.xlarge} ${cstyles.padtopsmall}`}>Payment request</div>

        <div className={cstyles.flexspacebetween} style={{ gap: 16, flexWrap: "wrap", marginTop: 12 }}>
          <div className={cstyles.verticalflex} style={{ flex: "1 1 300px", minWidth: 0 }}>
            <div>
              <div className={cstyles.sublight}>Address</div>
              <div className={`${cstyles.padtopsmall} ${cstyles.fixedfont} ${cstyles.breakword}`}>{address}</div>
            </div>

            <div className={cstyles.padtopsmall}>
              <div className={cstyles.sublight}>Amount ({currencyName})</div>
              <div className={cstyles.fieldrow}>
                <input
                  autoFocus
                  aria-label="Amount"
                  className={cstyles.fieldinput}
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value.replace(",", "."));
                    setUri(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") generate();
                  }}
                />
              </div>
              {touched && !!amountError && <div className={`${cstyles.red} ${cstyles.small}`}>{amountError}</div>}
            </div>

            <div className={cstyles.padtopsmall}>
              <div className={cstyles.sublight}>Memo</div>
              {allowsMemo ? (
                <>
                  <textarea
                    aria-label="Memo"
                    className={cstyles.fieldinput}
                    rows={4}
                    placeholder="Invoice or order number, a note for the payer"
                    style={{ width: "100%", boxSizing: "border-box", resize: "vertical" }}
                    value={memo}
                    onChange={(e) => {
                      setMemo(e.target.value);
                      setUri(null);
                    }}
                  />
                  <div
                    className={`${cstyles.small} ${memoError ? cstyles.red : cstyles.sublight}`}
                    style={{ textAlign: "right" }}
                  >
                    {memoError ?? `${memoBytesUsed} / ${PAYMENT_REQUEST_MEMO_MAX_BYTES} bytes`}
                  </div>
                </>
              ) : (
                <div className={`${cstyles.sublight} ${cstyles.small}`}>
                  A transparent address cannot receive a memo.
                </div>
              )}
            </div>

            <div className={cstyles.margintoplarge}>
              <button type="button" className={cstyles.primarybutton} onClick={generate}>
                Generate
              </button>
            </div>
          </div>

          <div
            className={cstyles.verticalflex}
            style={{ flex: "0 0 auto", alignItems: "center", justifyContent: "center", margin: "0 auto" }}
          >
            {uri ? (
              <>
                <button
                  type="button"
                  aria-label="Download QR code"
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "block" }}
                  onClick={() => downloadQrCanvas(canvasRef.current, qrFileName("request", currentWallet?.alias))}
                >
                  <QRCodeCanvas
                    ref={canvasRef}
                    includeMargin={true}
                    size={260}
                    value={uri}
                    className={styles.receiveQrcode}
                  />
                  <div style={{ color: "var(--color-zingo)", textAlign: "center" }}>Click to download</div>
                </button>
                <button
                  type="button"
                  className={`${cstyles.primarybutton} ${cstyles.margintoplarge}`}
                  disabled={copied}
                  onClick={() => copy(uri)}
                >
                  {copied ? "Copied!" : "Copy request link"}
                </button>
                {/* What the link says, for a user who wants to check it. */}
                <details className={`${cstyles.sublight} ${cstyles.small}`} style={{ maxWidth: 280, marginTop: 8 }}>
                  <summary style={{ cursor: "pointer", textAlign: "center" }}>Show request link</summary>
                  <div className={cstyles.breakword}>{uri}</div>
                </details>
              </>
            ) : (
              <div
                className={`${cstyles.sublight} ${cstyles.center}`}
                style={{
                  width: 260,
                  height: 260,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1px dashed var(--color-primary)",
                  borderRadius: 8,
                  padding: 16,
                  boxSizing: "border-box",
                }}
              >
                Enter the amount{allowsMemo ? " and memo" : ""}, then Generate.
              </div>
            )}
          </div>
        </div>

        <div className={`${cstyles.center} ${cstyles.margintoplarge}`}>
          <button type="button" className={cstyles.primarybutton} onClick={closeModal}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default PaymentRequestModal;
