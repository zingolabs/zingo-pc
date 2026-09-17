import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "../../test-utils";
import ScanQrModal from "./ScanQrModal";

jest.mock("../../electronBridge");

let mockRead: (file: Blob) => Promise<any> = async () => ({ ok: true, text: "u1scanned" });
jest.mock("../../utils/qrImage", () => ({
  readQrFromImageFile: (file: Blob) => mockRead(file),
}));

const image = () => new File(["fake"], "code.png", { type: "image/png" });

const renderModal = (props: Partial<React.ComponentProps<typeof ScanQrModal>> = {}) => {
  const onScanned = jest.fn();
  const closeModal = jest.fn();
  render(<ScanQrModal modalIsOpen={true} closeModal={closeModal} onScanned={onScanned} {...props} />);
  return { onScanned, closeModal };
};

const chooseFile = (file: File) =>
  fireEvent.change(screen.getByLabelText("Image with a QR code"), { target: { files: [file] } });

beforeEach(() => {
  mockRead = async () => ({ ok: true, text: "u1scanned" });
});

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
