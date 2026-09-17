import jsQR from "jsqr";

/**
 * Reading a QR code out of an image the user brings in: a file they choose, one
 * they drop on the dialog, or a screenshot they paste.
 *
 * Everything happens in the renderer, on the pixels: the image is never drawn
 * into the page (so the CSP needs no `blob:` in `img-src`), never written to
 * disk, and never leaves the machine. jsQR is plain JavaScript, so nothing here
 * needs `wasm-unsafe-eval` either.
 */

/** What a decoder gives back for one attempt: the text, or nothing found. */
export type QrDecoder = (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null;

export type QrImageResult =
  | { ok: true; text: string }
  /** The file could be read but holds no code this decoder can see. */
  | { ok: false; reason: "no-code" }
  /** The file is not an image, or is damaged. */
  | { ok: false; reason: "unreadable" };

/**
 * The widths to try, largest first.
 *
 * A photo of a screen is far larger than the code in it and costs seconds to
 * scan at full size, while a code photographed small can be lost once the
 * image is shrunk. So the full image is tried first, capped at
 * `MAX_SCAN_WIDTH`, and then one smaller pass, which is what usually reads a
 * phone photo: shrinking averages away the camera's noise between modules.
 */
export const MAX_SCAN_WIDTH = 1600;
const SECOND_PASS_WIDTH = 800;

export function scanWidths(width: number): number[] {
  const first = Math.min(width, MAX_SCAN_WIDTH);
  return first > SECOND_PASS_WIDTH ? [first, SECOND_PASS_WIDTH] : [first];
}

/**
 * The code in one set of pixels, or null.
 *
 * Both polarities are tried: a code printed light on dark is as common in a
 * screenshot of a wallet as the usual dark on light.
 */
export function decodeQr(
  pixels: { data: Uint8ClampedArray; width: number; height: number },
  decode: QrDecoder = (data, width, height) => jsQR(data, width, height, { inversionAttempts: "attemptBoth" }),
): string | null {
  const found = decode(pixels.data, pixels.width, pixels.height);
  const text = found?.data.trim();
  return text ? text : null;
}

/**
 * The code in `file`, scanned at the widths above until one reads.
 *
 * `createImageBitmap` decodes every format the renderer supports and hands
 * back something a canvas can draw at any size, which is what the smaller pass
 * needs.
 */
export async function readQrFromImageFile(file: Blob): Promise<QrImageResult> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { ok: false, reason: "unreadable" };
  }

  try {
    for (const width of scanWidths(bitmap.width)) {
      const height = Math.max(1, Math.round((bitmap.height * width) / bitmap.width));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return { ok: false, reason: "unreadable" };
      ctx.drawImage(bitmap, 0, 0, width, height);
      const text = decodeQr(ctx.getImageData(0, 0, width, height));
      if (text) return { ok: true, text };
    }
  } finally {
    bitmap.close();
  }

  return { ok: false, reason: "no-code" };
}
