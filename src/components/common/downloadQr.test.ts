import { qrFileName, wrapTitle } from "./downloadQr";

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

describe("qrFileName", () => {
  it("names the kind and the wallet", () => {
    expect(qrFileName("u", "My wallet")).toBe("QR_u_Zingo_PC_My_wallet.png");
    expect(qrFileName("t")).toBe("QR_t_Zingo_PC.png");
  });

  // The file should say what the request asks for.
  it("adds a payment request's title after the wallet", () => {
    expect(qrFileName("request", "New tm", "Pago de factura 34")).toBe(
      "QR_request_Zingo_PC_New_tm_Pago_de_factura_34.png",
    );
    expect(qrFileName("request", "New tm", "")).toBe("QR_request_Zingo_PC_New_tm.png");
  });

  it("makes both safe for a file name, and cuts a long title", () => {
    expect(qrFileName("request", "a/b", "x:y?")).toBe("QR_request_Zingo_PC_a_b_x_y.png");
    expect(qrFileName("request", "w", "ñ".repeat(60))).toBe("QR_request_Zingo_PC_w_" + "ñ".repeat(40) + ".png");
  });
});
