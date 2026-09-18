import React, { useCallback, useEffect, useRef, useState } from "react";
import Modal from "react-modal";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faQrcode } from "@fortawesome/free-solid-svg-icons";

import swapStyles from "../swap/Swap.module.css";
import cstyles from "./Common.module.css";
import { decodeQrFromVideo, readQrFromImageFile } from "../../utils/qrImage";
import { cameraErrorMessage, cameraPlatform } from "../../utils/camera";
import { ipcRenderer } from "../../electronBridge";

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

/** How often a camera frame is read while the preview runs. */
const CAMERA_SCAN_INTERVAL_MS = 250;

/**
 * Reads a QR code out of an image or from the camera.
 *
 * Images come three ways, because they suit different moments on a desktop: a
 * payment request saved as a file, the same file dragged from a folder, and a
 * screenshot of a code on screen, which never becomes a file at all. The
 * camera is for a code on paper or on a phone.
 *
 * Everything is read in memory and thrown away: no image or frame is stored
 * or sent. The camera is released as soon as a code is read, the camera view
 * is left, or the dialog closes.
 */
const ScanQrModal: React.FC<ScanQrModalProps> = ({ modalIsOpen, closeModal, onScanned, validate }) => {
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState<boolean>(false);
  const [draggingOver, setDraggingOver] = useState<boolean>(false);
  const [cameraOn, setCameraOn] = useState<boolean>(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Hands the text over when the caller accepts it; otherwise says why and
  // reports false, so the camera keeps looking for a better code.
  const accept = useCallback(
    async (text: string): Promise<boolean> => {
      const rejected = validate ? await validate(text) : null;
      if (rejected) {
        setError(rejected);
        return false;
      }
      onScanned(text);
      closeModal();
      return true;
    },
    [closeModal, onScanned, validate],
  );

  // The camera reads the latest accept through this ref. As an effect
  // dependency it restarted the camera whenever the caller re-rendered — Send
  // does every few seconds — which showed as the preview blinking to black.
  const acceptRef = useRef(accept);
  acceptRef.current = accept;

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
        await accept(result.text);
      } finally {
        setReading(false);
      }
    },
    [accept],
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

  // The camera, while its view is on: opened, read a few times a second, and
  // released on every way out. Reopened when another camera is chosen.
  useEffect(() => {
    if (!modalIsOpen || !cameraOn) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let lastRejected = "";

    const stop = () => {
      clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    (async () => {
      // macOS asks the user once; a refusal there never reaches getUserMedia.
      const allowed: boolean = await ipcRenderer.invoke("camera:request-access").catch(() => false);
      if (cancelled) return;
      if (!allowed) {
        setError(cameraErrorMessage("NotAllowedError", cameraPlatform()));
        setCameraOn(false);
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: cameraId ? { deviceId: { exact: cameraId } } : true,
          audio: false,
        });
      } catch (e) {
        if (!cancelled) {
          setError(cameraErrorMessage((e as { name?: string })?.name, cameraPlatform()));
          setCameraOn(false);
        }
        return;
      }
      if (cancelled || !videoRef.current) {
        stop();
        return;
      }
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => undefined);

      // Labels are only filled in once a camera has been allowed, so the list
      // is read now rather than before.
      const devices = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
      if (!cancelled) setCameras(devices.filter((d) => d.kind === "videoinput"));

      const canvas = frameCanvasRef.current ?? document.createElement("canvas");
      frameCanvasRef.current = canvas;
      let busy = false;
      timer = setInterval(async () => {
        if (busy || !videoRef.current) return;
        const text = decodeQrFromVideo(videoRef.current, canvas);
        // The same refused code stays in view for many frames; judge it once.
        if (!text || text === lastRejected) return;
        busy = true;
        const taken = await acceptRef.current(text);
        busy = false;
        if (taken) stop();
        else lastRejected = text;
      }, CAMERA_SCAN_INTERVAL_MS);
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, [modalIsOpen, cameraOn, cameraId]);

  return (
    <Modal
      isOpen={modalIsOpen}
      onRequestClose={closeModal}
      className={swapStyles.narrowmodal}
      overlayClassName={cstyles.modalOverlay}
    >
      <div className={cstyles.verticalflex}>
        <div className={`${cstyles.center} ${cstyles.xlarge} ${cstyles.padtopsmall}`}>Scan a QR code</div>

        {cameraOn ? (
          <div className={cstyles.verticalflex} style={{ marginTop: 12, alignItems: "center" }}>
            <video
              ref={videoRef}
              aria-label="Camera preview"
              muted
              playsInline
              style={{ width: "100%", maxHeight: 320, borderRadius: 8, background: "#000" }}
            />
            <div className={`${cstyles.sublight} ${cstyles.small} ${cstyles.padtopsmall}`}>
              Hold the code in front of the camera.
            </div>
            {cameras.length > 1 && (
              <select
                aria-label="Camera"
                className={cstyles.fieldselect}
                style={{ marginTop: 8 }}
                value={cameraId}
                onChange={(e) => setCameraId(e.target.value)}
              >
                <option value="">Default camera</option>
                {cameras.map((camera, i) => (
                  <option key={camera.deviceId || i} value={camera.deviceId}>
                    {camera.label || `Camera ${i + 1}`}
                  </option>
                ))}
              </select>
            )}
          </div>
        ) : (
          <div
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
        )}

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
          {cameraOn ? (
            <button
              type="button"
              className={cstyles.primarybutton}
              onClick={() => {
                setError(null);
                setCameraOn(false);
              }}
            >
              Use an image
            </button>
          ) : (
            <>
              <button
                type="button"
                className={cstyles.primarybutton}
                disabled={reading}
                onClick={() => {
                  setError(null);
                  setCameraOn(true);
                }}
              >
                Camera
              </button>
              <button
                type="button"
                className={cstyles.primarybutton}
                disabled={reading}
                onClick={() => fileInputRef.current?.click()}
              >
                Choose image
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default ScanQrModal;
