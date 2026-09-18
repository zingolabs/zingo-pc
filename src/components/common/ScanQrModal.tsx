import React, { useCallback, useEffect, useRef, useState } from "react";
import Modal from "react-modal";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faQrcode } from "@fortawesome/free-solid-svg-icons";

import swapStyles from "../swap/Swap.module.css";
import cstyles from "./Common.module.css";
import { readQrFromImageFile } from "../../utils/qrImage";

type ScanQrModalProps = {
  modalIsOpen: boolean;
  closeModal: () => void;
  /** The text the code carried. The caller decides what it is worth. */
  onScanned: (text: string) => void;
  /**
   * Judges the scanned text before it is handed over: the message to show, or
   * null to accept it. Without one, anything a code carries is accepted.
   */
  validate?: (text: string) => Promise<string | null>;
};

/**
 * Reads a QR code out of an image: one the user chooses, drops here, or pastes.
 *
 * Three ways in because they suit different moments on a desktop: a payment
 * request saved as a file, the same file dragged from a folder, and a
 * screenshot of a code on screen, which never becomes a file at all. There is
 * no camera here (see the plan): this needs no permission on any platform and
 * nothing changes for the App Store build.
 *
 * The image is read in memory and thrown away; nothing is stored or sent.
 */
const ScanQrModal: React.FC<ScanQrModalProps> = ({ modalIsOpen, closeModal, onScanned, validate }) => {
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState<boolean>(false);
  const [draggingOver, setDraggingOver] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImage = useCallback(
    async (file: Blob | null | undefined) => {
      if (!file) return;
      setError(null);
      setReading(true);
      try {
        const result = await readQrFromImageFile(file);
        if (!result.ok) {
          setError(
            result.reason === "no-code"
              ? "No QR code found in that image."
              : "That file could not be read as an image.",
          );
          return;
        }
        const rejected = validate ? await validate(result.text) : null;
        if (rejected) {
          setError(rejected);
          return;
        }
        onScanned(result.text);
        closeModal();
      } finally {
        setReading(false);
      }
    },
    [closeModal, onScanned, validate],
  );

  // A screenshot of a code on screen is the fastest route of the three, and it
  // never becomes a file: the paste lands on the window, not on a field.
  useEffect(() => {
    if (!modalIsOpen) return;
    const onPaste = (event: ClipboardEvent) => {
      const image = Array.from(event.clipboardData?.items ?? []).find((item) => item.type.startsWith("image/"));
      if (!image) return;
      event.preventDefault();
      void handleImage(image.getAsFile());
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [modalIsOpen, handleImage]);

  return (
    <Modal
      isOpen={modalIsOpen}
      onRequestClose={closeModal}
      className={swapStyles.narrowmodal}
      overlayClassName={cstyles.modalOverlay}
    >
      <div className={cstyles.verticalflex}>
        <div className={`${cstyles.center} ${cstyles.xlarge} ${cstyles.padtopsmall}`}>Scan a QR code</div>

        <div
          // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
          role="region"
          aria-label="Drop an image with a QR code"
          onDragOver={(e) => {
            e.preventDefault();
            setDraggingOver(true);
          }}
          onDragLeave={() => setDraggingOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDraggingOver(false);
            void handleImage(e.dataTransfer?.files?.[0]);
          }}
          className={`${cstyles.center} ${cstyles.sublight}`}
          style={{
            marginTop: 12,
            padding: 24,
            borderRadius: 8,
            border: `1px dashed var(--color-${draggingOver ? "zingo" : "primary"})`,
          }}
        >
          <FontAwesomeIcon icon={faQrcode} size="2x" />
          <div style={{ marginTop: 10 }}>
            {reading ? "Reading…" : "Drop an image here, paste a screenshot, or choose a file."}
          </div>
        </div>

        {!!error && (
          <div className={`${cstyles.red} ${cstyles.center} ${cstyles.padtopsmall}`} style={{ marginTop: 8 }}>
            {error}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          aria-label="Image with a QR code"
          style={{ display: "none" }}
          onChange={(e) => {
            void handleImage(e.target.files?.[0]);
            // Same file twice in a row must fire the change again.
            e.target.value = "";
          }}
        />

        <div className={cstyles.buttoncontainer}>
          <button type="button" className={cstyles.primarybutton} onClick={closeModal}>
            Cancel
          </button>
          <button
            type="button"
            className={cstyles.primarybutton}
            disabled={reading}
            onClick={() => fileInputRef.current?.click()}
          >
            Choose image
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ScanQrModal;
