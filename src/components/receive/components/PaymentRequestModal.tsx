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
import AmountCurrencyToggle from "../../common/AmountCurrencyToggle";
import { useUsdAmount } from "../../common/useUsdAmount";
import { composeQrWithTitle, downloadQrCanvas, qrFileName } from "../../common/downloadQr";
import { buildPaymentRequestUri, validatePaymentRequest } from "../../../utils/paymentRequest";

/** Between one field and the next: close enough that the form fits without scrolling. */
const FIELD_GAP: React.CSSProperties = { marginTop: 10 };

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
  const { currentWallet, zecPrice } = useContext(ContextApp);
  const [title, setTitle] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [memo, setMemo] = useState<string>("");
  // The request as it was generated. Editing a field drops it, so the code on
  // the right never shows a request the fields no longer say.
  const [generated, setGenerated] = useState<{ uri: string; title: string } | null>(null);
  const [showLink, setShowLink] = useState<boolean>(false);
  const [touched, setTouched] = useState<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { copied, copy } = useCopy(1500);

  const { titleError, amountError, memoError } = validatePaymentRequest({ title, amount, memo, allowsMemo });
  const valid = !titleError && !amountError && !memoError;
  const memoBytesUsed = new TextEncoder().encode(memo).length;

  const edited = () => {
    setGenerated(null);
    setShowLink(false);
  };

  // The amount can be typed in USD. The request asks for ZEC, and once it is
  // generated the price no longer moves it: the code shows a fixed amount.
  const usdAmount = useUsdAmount({
    zecText: amount,
    setZecText: (zecText) => {
      setAmount(zecText.replace(",", "."));
      edited();
    },
    zecPrice,
    available: currencyName === "ZEC",
    frozen: !!generated,
  });
  const amountZec = parseFloat(amount);

  const generate = () => {
    setTouched(true);
    if (!valid) return;
    setGenerated({ uri: buildPaymentRequestUri({ address, amount, memo, message: title }), title: title.trim() });
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

        <div className={cstyles.flexspacebetween} style={{ gap: 16, flexWrap: "wrap", marginTop: 8 }}>
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

            {/* Optional words to go with the code: over it here, in the saved
                image, and as the request's message, which the payer's wallet
                shows. */}
            <div className={cstyles.verticalflex} style={FIELD_GAP}>
              <div style={{ marginBottom: 3 }} className={cstyles.flexspacebetween}>
                <div className={cstyles.sublight}>Title (optional)</div>
                <div className={cstyles.validationerror}>
                  {titleError ? (
                    <span className={cstyles.red}>{titleError + ". " + title.trim().length}</span>
                  ) : (
                    <span>{title.trim().length}</span>
                  )}
                </div>
              </div>
              <div className={cstyles.fieldrow}>
                <input
                  aria-label="Title"
                  className={cstyles.fieldinput}
                  placeholder="Invoice 34, a donation…"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    edited();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") generate();
                  }}
                />
              </div>
            </div>

            {/* The amount and memo fields are Send's: a request is the other half
                of the same payment. */}
            <div className={cstyles.verticalflex} style={FIELD_GAP}>
              <div style={{ marginBottom: 3 }} className={cstyles.flexspacebetween}>
                <div className={cstyles.sublight}>Amount ({usdAmount.usdMode ? "USD" : currencyName})</div>
                <div className={cstyles.validationerror}>
                  {touched && !!amountError ? (
                    <span className={cstyles.red}>{amountError}</span>
                  ) : !Number.isFinite(amountZec) || amountZec <= 0 ? null : usdAmount.usdMode ? (
                    // Typed in dollars: what the request will ask for, in ZEC.
                    <span>
                      ≈ {currencyName} {Utils.maxPrecisionTrimmed(amountZec)}
                    </span>
                  ) : currencyName === "ZEC" && zecPrice > 0 ? (
                    <span>{Utils.getZecToUsdString(zecPrice, amountZec)}</span>
                  ) : null}
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
                  value={usdAmount.inputValue}
                  onChange={(e) => usdAmount.onInputChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") generate();
                  }}
                />
                {currencyName === "ZEC" && <AmountCurrencyToggle amount={usdAmount} currencyName={currencyName} />}
              </div>
            </div>

            <div className={cstyles.verticalflex} style={FIELD_GAP}>
              {allowsMemo ? (
                <>
                  <div style={{ marginBottom: 3 }} className={cstyles.flexspacebetween}>
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
                        edited();
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
            {generated ? (
              <>
                {!!generated.title && (
                  <div
                    className={`${cstyles.large} ${cstyles.center} ${cstyles.breakword}`}
                    style={{ maxWidth: 260, marginBottom: 8 }}
                  >
                    {generated.title}
                  </div>
                )}
                <button
                  type="button"
                  aria-label="Download QR code"
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "block" }}
                  onClick={() =>
                    downloadQrCanvas(
                      canvasRef.current && composeQrWithTitle(canvasRef.current, generated.title),
                      qrFileName("request", currentWallet?.alias, generated.title),
                    )
                  }
                >
                  <QRCodeCanvas
                    ref={canvasRef}
                    // Two modules of quiet zone instead of the standard four: the white band
                    // around the code took as much room as the code in a list of them, and
                    // readers manage with two on a screen. The saved image gets its own
                    // margin back (see composeQrWithTitle).
                    marginSize={2}
                    size={260}
                    value={generated.uri}
                    className={styles.receiveQrcode}
                  />
                  <div style={{ color: "var(--color-zingo)", textAlign: "center" }}>Click to download</div>
                </button>
                <button
                  type="button"
                  className={cstyles.primarybutton}
                  style={{ marginTop: 10 }}
                  disabled={copied}
                  onClick={() => copy(generated.uri)}
                >
                  {copied ? "Copied!" : "Copy request link"}
                </button>
                {/* What the link says, for a user who wants to check it. It opens
                    under both columns: squeezed under the code it read as a
                    ribbon of broken text. */}
                <button
                  type="button"
                  className={`${cstyles.sublight} ${cstyles.small}`}
                  style={{ background: "none", border: "none", cursor: "pointer", marginTop: 8, color: "inherit" }}
                  aria-expanded={showLink}
                  onClick={() => setShowLink((shown) => !shown)}
                >
                  {showLink ? "Hide request link" : "Show request link"}
                </button>
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

        {!!generated && showLink && (
          <div className={`${cstyles.well} ${cstyles.fixedfont} ${cstyles.breakword}`} style={{ marginTop: 12 }}>
            {generated.uri}
          </div>
        )}

        <div className={cstyles.buttoncontainer} style={{ paddingTop: 16 }}>
          <button type="button" className={cstyles.primarybutton} onClick={closeModal}>
            Cancel
          </button>
          {/* Only while there is nothing generated: any edit drops the request,
              so with one on screen there is nothing new to generate. */}
          {!generated && (
            <button type="button" className={cstyles.primarybutton} onClick={generate}>
              Generate
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default PaymentRequestModal;
