import { contactMatches, filterContacts } from "./contactSearch";

const pepe = { label: "Pepe Pérez", address: "u1abcpepe000" };
const shop = { label: "Coffee Shop", address: "t1shopaddr" };

describe("contactMatches", () => {
  it("finds a contact by part of its name or of its address", () => {
    expect(contactMatches(pepe, "pep")).toBe(true);
    expect(contactMatches(pepe, "abcpe")).toBe(true);
    expect(contactMatches(shop, "zzz")).toBe(false);
  });

  it("ignores case and accents", () => {
    expect(contactMatches(pepe, "PEREZ")).toBe(true);
    expect(contactMatches({ label: "Jose", address: "x" }, "José")).toBe(true);
  });

  // Each word narrows: one can match the name and another the address.
  it("needs every word, in either field", () => {
    expect(contactMatches(pepe, "pepe u1abc")).toBe(true);
    expect(contactMatches(pepe, "pepe t1")).toBe(false);
  });

  it("matches everything for an empty query", () => {
    expect(contactMatches(shop, "   ")).toBe(true);
  });
});

describe("filterContacts", () => {
  it("keeps the matches in their order", () => {
    expect(filterContacts([shop, pepe], "p")).toEqual([shop, pepe]);
    expect(filterContacts([shop, pepe], "coffee")).toEqual([shop]);
  });
});
