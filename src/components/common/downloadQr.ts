import { ipcRenderer, isSandboxed } from "../../electronBridge";

/**
 * Saves the image of a QR code drawn on `canvas` as a PNG.
 *
 * The MAS sandbox can't write to the Downloads folder without the
 * `files.downloads.read-write` entitlement (which Apple flagged as unused
 * under 2.4.5(i)), so there it goes through the main-process save dialog,
 * which uses the `files.user-selected.read-write` entitlement already
 * declared. Every other build keeps the browser download flow, which lands in
 * the OS download folder without a prompt.
 */
export async function downloadQrCanvas(canvas: HTMLCanvasElement | null, suggestedName: string): Promise<void> {
  if (!canvas) return;

  if (isSandboxed) {
    const dataUrl = canvas.toDataURL("image/png");
    await ipcRenderer.invoke("save-png", { dataUrl, suggestedName });
    return;
  }

  const pngUrl = canvas.toDataURL("image/png").replace("image/png", "image/octet-stream");
  const downloadLink = document.createElement("a");
  downloadLink.href = pngUrl;
  downloadLink.download = suggestedName;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
}

/** A file name for a QR image that tells one wallet's files from another's. */
export function qrFileName(kind: string, walletAlias?: string): string {
  // Filesystem-unfriendly characters would break the save on some systems.
  const walletSuffix = walletAlias ? "_" + walletAlias.replace(/[\\/:*?"<>|]/g, "_") : "";
  return `QR_${kind}_Zingo_PC${walletSuffix}.png`;
}
