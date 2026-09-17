import { wrapTitle } from "./downloadQr";

jest.mock("../../electronBridge");

// One unit per character, so widths are character counts.
const measure = (s: string) => Array.from(s).length;

describe("wrapTitle", () => {
  // The split once took the letter "s" for whitespace and dropped every one.
  it("keeps every letter, lowercase s included", () => {
    expect(wrapTitle("ssss sss", measure, 20)).toEqual(["ssss sss"]);
    expect(wrapTitle("pago de facturas", measure, 40).join(" ")).toBe("pago de facturas");
  });

  it("breaks at spaces when the line is full", () => {
    expect(wrapTitle("pago de factura numero 34", measure, 10)).toEqual(["pago de", "factura", "numero 34"]);
  });

  // Drawn whole, a long word was squeezed until it could not be read.
  it("breaks a word too wide for a line between characters", () => {
    expect(wrapTitle("jajajajajaja", measure, 5)).toEqual(["jajaj", "ajaja", "ja"]);
  });

  it("starts a word too wide on its own line", () => {
    expect(wrapTitle("hi abcdefgh", measure, 5)).toEqual(["hi", "abcde", "fgh"]);
  });

  it("never splits an accented letter or an emoji", () => {
    expect(wrapTitle("ñañaña✨✨", measure, 3)).toEqual(["ñañ", "aña", "✨✨"]);
  });
});
