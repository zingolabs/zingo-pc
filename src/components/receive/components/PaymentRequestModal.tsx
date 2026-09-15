import React, { useContext, useRef, useState } from "react";
import Modal from "react-modal";
import { QRCodeCanvas } from "qrcode.react";
import TextareaAutosize from "react-textarea-autosize";

import cstyles from "../../common/Common.module.css";
import swapStyles from "../../swap/Swap.module.css";
import styles from "../Receive.module.css";
import { ContextApp } from "../../../context/ContextAppState";
import Utils from "../../../utils/utils";
import { useCopy } from "../../common/useCopy";
import { downloadQrCanvas, qrFileName } from "../../common/downloadQr";
import { buildPaymentRequestUri, validatePaymentRequest } from "../../../utils/paymentRequest";

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
            {/* As the address reads in Receive: a unified address in three
                lines, a shorter one in one. */}
            <div>
              <div className={cstyles.sublight}>Address</div>
              <div className={`${cstyles.padtopsmall} ${cstyles.fixedfont}`}>
                {address.length < 80
                  ? address
                  : Utils.splitStringIntoChunks(address, 3).map((item) => <div key={item}>{item}</div>)}
              </div>
            </div>

            {/* The amount and memo fields are Send's: a request is the other half
                of the same payment. */}
            <div className={`${cstyles.verticalflex} ${cstyles.margintoplarge}`}>
              <div style={{ marginBottom: 5 }} className={cstyles.flexspacebetween}>
                <div className={cstyles.sublight}>Amount ({currencyName})</div>
                <div className={cstyles.validationerror}>
                  {touched && !!amountError && <span className={cstyles.red}>{amountError}</span>}
                </div>
              </div>
              <div className={cstyles.fieldrow}>
                <input
                  autoFocus
                  aria-label="Amount"
                  className={cstyles.fieldamount}
                  inputMode="decimal"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="0"
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
            </div>

            <div className={`${cstyles.verticalflex} ${cstyles.margintoplarge}`}>
              {allowsMemo ? (
                <>
                  <div style={{ marginBottom: 5 }} className={cstyles.flexspacebetween}>
                    <div className={cstyles.sublight}>Memo</div>
                    <div className={cstyles.validationerror}>
                      {memoError ? (
                        <span className={cstyles.red}>{memoError + ". " + memoBytesUsed}</span>
                      ) : (
                        <span>{memoBytesUsed}</span>
                      )}
                    </div>
                  </div>
                  <div className={cstyles.fieldrowmulti}>
                    <TextareaAutosize
                      aria-label="Memo"
                      className={cstyles.fieldtextarea}
                      value={memo}
                      onChange={(e) => {
                        setMemo(e.target.value);
                        setUri(null);
                      }}
                      minRows={2}
                      maxRows={5}
                    />
                  </div>
                </>
              ) : (
                <div className={cstyles.sublight}>Memos only for Unified or Sapling addresses</div>
              )}
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

        <div className={cstyles.buttoncontainer}>
          <button type="button" className={cstyles.primarybutton} onClick={closeModal}>
            Cancel
          </button>
          <button type="button" className={cstyles.primarybutton} onClick={generate}>
            Generate
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default PaymentRequestModal;
