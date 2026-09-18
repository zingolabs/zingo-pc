import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "../../test-utils";
import ScanQrModal from "./ScanQrModal";

jest.mock("../../electronBridge");

let mockRead: (file: Blob) => Promise<any> = async () => ({ ok: true, text: "u1scanned" });
let mockFrame: () => string | null = () => null;
jest.mock("../../utils/qrImage", () => ({
  readQrFromImageFile: (file: Blob) => mockRead(file),
  decodeQrFromVideo: () => mockFrame(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ipcRenderer } = require("../../electronBridge");

const image = () => new File(["fake"], "code.png", { type: "image/png" });

const renderModal = (props: Partial<React.ComponentProps<typeof ScanQrModal>> = {}) => {
  const onScanned = jest.fn();
  const closeModal = jest.fn();
  render(<ScanQrModal modalIsOpen={true} closeModal={closeModal} onScanned={onScanned} {...props} />);
  return { onScanned, closeModal };
};

const chooseFile = (file: File) =>
  fireEvent.change(screen.getByLabelText("Image with a QR code"), { target: { files: [file] } });

// A camera the test controls: getUserMedia hands back a stream whose track
// records being stopped.
const track = { stop: jest.fn() };
const getUserMedia = jest.fn();
const enumerateDevices = jest.fn();

beforeEach(() => {
  mockRead = async () => ({ ok: true, text: "u1scanned" });
  mockFrame = () => null;
  track.stop.mockReset();
  getUserMedia.mockReset().mockResolvedValue({ getTracks: () => [track] });
  enumerateDevices.mockReset().mockResolvedValue([]);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia, enumerateDevices },
  });
  jest.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  (ipcRenderer.invoke as jest.Mock).mockReset().mockResolvedValue(true);
});

afterEach(() => jest.restoreAllMocks());

describe("ScanQrModal", () => {
  it("hands over what a chosen image carried, and closes", async () => {
    const { onScanned, closeModal } = renderModal();
    chooseFile(image());
    await waitFor(() => expect(onScanned).toHaveBeenCalledWith("u1scanned"));
    expect(closeModal).toHaveBeenCalled();
  });

  // Dragging the file from a folder is the same route with no dialog.
  it("reads an image dropped on it", async () => {
    const { onScanned } = renderModal();
    fireEvent.drop(screen.getByRole("region", { name: /drop an image/i }), {
      dataTransfer: { files: [image()] },
    });
    await waitFor(() => expect(onScanned).toHaveBeenCalledWith("u1scanned"));
  });

  // A code on screen never becomes a file: the screenshot is pasted.
  it("reads a screenshot pasted into the window", async () => {
    const { onScanned } = renderModal();
    const event: any = new Event("paste", { bubbles: true });
    event.clipboardData = { items: [{ type: "image/png", getAsFile: () => image() }] };
    fireEvent(window, event);
    await waitFor(() => expect(onScanned).toHaveBeenCalledWith("u1scanned"));
  });

  it("says so when the image holds no code, and stays open", async () => {
    mockRead = async () => ({ ok: false, reason: "no-code" });
    const { onScanned, closeModal } = renderModal();
    chooseFile(image());
    expect(await screen.findByText("No QR code found in that image.")).toBeInTheDocument();
    expect(onScanned).not.toHaveBeenCalled();
    expect(closeModal).not.toHaveBeenCalled();
  });

  it("says so when the file is not an image", async () => {
    mockRead = async () => ({ ok: false, reason: "unreadable" });
    renderModal();
    chooseFile(new File(["x"], "notes.txt", { type: "text/plain" }));
    expect(await screen.findByText("That file could not be read as an image.")).toBeInTheDocument();
  });

  // The caller judges the content; a code from another wallet's world must not
  // land in the field.
  it("shows the caller's refusal and keeps the code", async () => {
    const validate = jest.fn(async () => "That QR code does not carry a Zcash address or payment request.");
    const { onScanned } = renderModal({ validate });
    chooseFile(image());
    expect(await screen.findByText(/does not carry a Zcash address/)).toBeInTheDocument();
    expect(onScanned).not.toHaveBeenCalled();
  });
});

describe("ScanQrModal — camera", () => {
  it("opens the camera, reads a code from it and releases it", async () => {
    mockFrame = () => "u1fromcamera";
    const { onScanned, closeModal } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Camera" }));

    expect(await screen.findByLabelText("Camera preview")).toBeInTheDocument();
    await waitFor(() => expect(onScanned).toHaveBeenCalledWith("u1fromcamera"));
    expect(closeModal).toHaveBeenCalled();
    expect(getUserMedia).toHaveBeenCalledWith({ video: true, audio: false });
    await waitFor(() => expect(track.stop).toHaveBeenCalled());
  });

  // macOS asks once; after a refusal there, getUserMedia is never reached.
  it("says where to allow the camera when the OS refuses it", async () => {
    (ipcRenderer.invoke as jest.Mock).mockResolvedValue(false);
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Camera" }));

    expect(await screen.findByText(/Camera access is not allowed/)).toBeInTheDocument();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Camera" })).toBeInTheDocument();
  });

  it("says so when there is no camera", async () => {
    getUserMedia.mockRejectedValue(Object.assign(new Error("none"), { name: "NotFoundError" }));
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Camera" }));
    expect(await screen.findByText("No camera was found.")).toBeInTheDocument();
  });

  // Send re-renders every few seconds with new callbacks; the camera must not
  // restart for it, which showed as the preview blinking to black.
  it("keeps the camera open when the caller re-renders", async () => {
    const view = render(<ScanQrModal modalIsOpen={true} closeModal={jest.fn()} onScanned={jest.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Camera" }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));

    view.rerender(<ScanQrModal modalIsOpen={true} closeModal={jest.fn()} onScanned={jest.fn()} validate={jest.fn()} />);
    view.rerender(<ScanQrModal modalIsOpen={true} closeModal={jest.fn()} onScanned={jest.fn()} />);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(track.stop).not.toHaveBeenCalled();
  });

  // The camera light must go off the moment the user leaves the camera view.
  it("releases the camera when going back to an image", async () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Camera" }));
    await screen.findByLabelText("Camera preview");
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Use an image" }));
    await waitFor(() => expect(track.stop).toHaveBeenCalled());
    expect(screen.getByRole("region", { name: /drop an image/i })).toBeInTheDocument();
  });

  // A code from another wallet's world stays in view for many frames; it is
  // refused once and the camera keeps looking.
  it("refuses a foreign code once and keeps scanning", async () => {
    mockFrame = () => "https://example.com";
    const validate = jest.fn(async () => "That QR code does not carry a Zcash address or payment request.");
    const { onScanned } = renderModal({ validate });
    fireEvent.click(screen.getByRole("button", { name: "Camera" }));

    expect(await screen.findByText(/does not carry a Zcash address/)).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(validate).toHaveBeenCalledTimes(1);
    expect(onScanned).not.toHaveBeenCalled();
    expect(track.stop).not.toHaveBeenCalled();
  });
});
