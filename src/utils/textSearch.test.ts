import { matchesAllWords } from "./textSearch";

describe("matchesAllWords", () => {
  it("needs every word, anywhere in the row", () => {
    expect(matchesAllWords("Pepe Pérez u1abc", "pepe u1ab")).toBe(true);
    expect(matchesAllWords("Pepe Pérez u1abc", "pepe t1")).toBe(false);
  });

  it("ignores case and accents on both sides", () => {
    expect(matchesAllWords("Factura número 34", "NUMERO")).toBe(true);
    expect(matchesAllWords("Jose", "José")).toBe(true);
  });

  it("matches everything for an empty query", () => {
    expect(matchesAllWords("anything", "   ")).toBe(true);
  });
});
