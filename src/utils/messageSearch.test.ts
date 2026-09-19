import { messageMatches } from "./messageSearch";

const message = { memos: ["Factura número 34", "gracias!"], address: "u1pepeaddr" };

describe("messageMatches", () => {
  it("finds a message by part of its memo, ignoring case and accents", () => {
    expect(messageMatches(message, "factura")).toBe(true);
    expect(messageMatches(message, "NUMERO 34")).toBe(true);
    expect(messageMatches(message, "recibo")).toBe(false);
  });

  it("finds it by its address or the name that address is saved under", () => {
    expect(messageMatches(message, "u1pepe")).toBe(true);
    expect(messageMatches(message, "pepe gracias", "Pepe")).toBe(true);
    expect(messageMatches(message, "juan", "Pepe")).toBe(false);
  });

  it("matches everything for an empty query", () => {
    expect(messageMatches(message, "  ")).toBe(true);
    expect(messageMatches({ memos: undefined, address: undefined }, "")).toBe(true);
  });
});
