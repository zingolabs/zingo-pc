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

/**
 * The QR image with `title` written over it, for a request saved to share: the
 * picture has to say what it is for without the screen it came from. The code
 * keeps its quiet zone and its pixels; the title goes on a white band above,
 * wrapped to the code's width. Without a title, or where no 2D context can be
 * had, the code's own canvas comes back unchanged.
 */
export function composeQrWithTitle(qr: HTMLCanvasElement, title: string): HTMLCanvasElement {
  const text = title.trim();
  if (!text) return qr;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return qr;

  const width = qr.width;
  const fontSize = Math.max(12, Math.round(width / 16));
  const padding = Math.round(fontSize * 0.75);
  const font = `bold ${fontSize}px Roboto, Arial, Helvetica, sans-serif`;
  ctx.font = font;

  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > width - 2 * padding) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);

  const lineHeight = Math.round(fontSize * 1.3);
  const band = padding + lines.length * lineHeight;
  canvas.width = width;
  canvas.height = qr.height + band;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000000";
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  lines.forEach((l, i) => ctx.fillText(l, width / 2, padding + i * lineHeight, width - 2 * padding));
  ctx.drawImage(qr, 0, band);
  return canvas;
}
