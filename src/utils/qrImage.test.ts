import { MAX_SCAN_WIDTH, decodeQr, scanWidths } from "./qrImage";

const pixels = (width = 4, height = 4) => ({ data: new Uint8ClampedArray(width * height * 4), width, height });

describe("scanWidths", () => {
  // A photo of a screen costs seconds to scan whole; a code photographed small
  // is lost if only the shrunk pass runs.
  it("tries the image as it is, then one smaller pass", () => {
    expect(scanWidths(1200)).toEqual([1200, 800]);
  });

  it("caps the first pass so a huge photo does not stall the dialog", () => {
    expect(scanWidths(4032)).toEqual([MAX_SCAN_WIDTH, 800]);
  });

  it("scans a small image once", () => {
    expect(scanWidths(600)).toEqual([600]);
    expect(scanWidths(800)).toEqual([800]);
  });
});

describe("decodeQr", () => {
  it("gives back the text the code carried", () => {
    expect(decodeQr(pixels(), () => ({ data: "zcash:u1abc?amount=1" }))).toBe("zcash:u1abc?amount=1");
  });

  it("trims what the decoder returns, and treats blank as nothing found", () => {
    expect(decodeQr(pixels(), () => ({ data: "  u1abc \n" }))).toBe("u1abc");
    expect(decodeQr(pixels(), () => ({ data: "   " }))).toBeNull();
    expect(decodeQr(pixels(), () => null)).toBeNull();
  });

  it("hands the decoder the pixels it was given", () => {
    const decode = jest.fn(() => null);
    const p = pixels(8, 6);
    decodeQr(p, decode);
    expect(decode).toHaveBeenCalledWith(p.data, 8, 6);
  });
});
