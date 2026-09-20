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

/** A title longer than this is cut in the file name; the image keeps it whole. */
const FILE_NAME_TITLE_MAX_CHARS = 40;

/** `text` made safe for a file name on every system, or "" when nothing is left. */
function fileNamePart(text: string, maxChars: number = Infinity): string {
  const safe = text
    .trim()
    // Filesystem-unfriendly characters would break the save on some systems,
    // and control characters have no place in a file name.
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, "_")
    .replace(/\s+/g, "_");
  return Array.from(safe)
    .slice(0, maxChars)
    .join("")
    .replace(/^[_.]+|[_.]+$/g, "");
}

/**
 * A file name for a QR image: its kind, the wallet it belongs to, so one
 * wallet's files are told from another's, and for a payment request its title,
 * so the file says what it asks for.
 */
export function qrFileName(kind: string, walletAlias?: string, title?: string): string {
  const parts = [
    `QR_${kind}_Zingo_PC`,
    fileNamePart(walletAlias ?? ""),
    fileNamePart(title ?? "", FILE_NAME_TITLE_MAX_CHARS),
  ];
  return `${parts.filter(Boolean).join("_")}.png`;
}

/**
 * `text` in lines no wider than `maxWidth`, as `measure` reports widths.
 *
 * Broken at whitespace, and a word too wide for a line on its own is broken
 * between characters: drawn whole, the canvas squeezes it until it cannot be
 * read. Characters are taken as code points, so an accent or an emoji is
 * never split in half.
 */
export function wrapTitle(text: string, measure: (s: string) => number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  const push = (piece: string, separator: string) => {
    const candidate = line ? `${line}${separator}${piece}` : piece;
    if (!line || measure(candidate) <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = piece;
    }
  };

  for (const word of text.trim().split(/\s+/)) {
    if (measure(word) <= maxWidth) {
      push(word, " ");
      continue;
    }
    // Too wide alone: start it on a line of its own and fill character by character.
    if (line) {
      lines.push(line);
      line = "";
    }
    for (const char of Array.from(word)) push(char, "");
  }
  if (line) lines.push(line);
  return lines;
}

/** The width a saved request's QR is drawn at, whatever its size on screen. */
export const EXPORTED_QR_SIZE = 1024;

/**
 * The QR image with `title` written over it, for a request saved to share: the
 * picture has to say what it is for without the screen it came from.
 *
 * The code is scaled up to EXPORTED_QR_SIZE with its modules kept sharp, and
 * the title is added as a band above it rather than taken out of it: the code
 * stays the same size however long the title is, and a longer title only makes
 * the image taller; without one there is no band. Where no 2D context can be
 * had, the code's own canvas comes back unchanged.
 */
export function composeQrWithTitle(qr: HTMLCanvasElement, title: string): HTMLCanvasElement {
  const text = title.trim();
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return qr;

  const code = Math.max(qr.width, EXPORTED_QR_SIZE);
  const codeHeight = Math.round((qr.height * code) / qr.width);
  // The quiet zone the screen trims back, given back in the file: a saved or
  // printed code is read from further away and off a photo.
  const quiet = Math.round(code * 0.04);
  const width = code + 2 * quiet;
  const qrHeight = codeHeight + 2 * quiet;
  const fontSize = Math.round(width / 22);
  const padding = Math.round(fontSize * 0.75);
  const font = `bold ${fontSize}px Roboto, Arial, Helvetica, sans-serif`;
  ctx.font = font;

  const lines = text ? wrapTitle(text, (s) => ctx.measureText(s).width, width - 2 * padding) : [];

  const lineHeight = Math.round(fontSize * 1.3);
  const band = lines.length > 0 ? padding + lines.length * lineHeight : 0;
  canvas.width = width;
  canvas.height = qrHeight + band;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000000";
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  lines.forEach((l, i) => ctx.fillText(l, width / 2, padding + i * lineHeight, width - 2 * padding));
  // Nearest-neighbour, so the scaled modules keep hard edges and still scan.
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qr, quiet, band + quiet, code, codeHeight);
  return canvas;
}
