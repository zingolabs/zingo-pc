/**
 * @jest-environment node
 */

const { deriveRecordKey, isV2, encryptV2, decryptV2 } = require("../../public/swapCrypto");

const UFVK = "uview1qqqqqqqqqqqqqqqqqqzingotestufvkmaterialxyz";
const RECORDS = JSON.stringify([{ recordId: "rec-1", status: "completed" }]);

describe("swap record encryption", () => {
  // The whole point: the same wallet produces the same key wherever it is
  // opened, so the file travels with it.
  it("gives one wallet one key, on any installation", () => {
    expect(deriveRecordKey(UFVK).equals(deriveRecordKey(UFVK))).toBe(true);
    expect(deriveRecordKey(UFVK).equals(deriveRecordKey(`${UFVK}x`))).toBe(false);
  });

  it("has nothing to derive from a missing UFVK", () => {
    expect(deriveRecordKey("")).toBeNull();
    expect(deriveRecordKey(undefined)).toBeNull();
  });

  it("reads back what it wrote", () => {
    expect(decryptV2(encryptV2(RECORDS, deriveRecordKey(UFVK)), deriveRecordKey(UFVK))).toBe(RECORDS);
  });

  it("refuses another wallet's file rather than returning nonsense", () => {
    const blob = encryptV2(RECORDS, deriveRecordKey(UFVK));

    expect(() => decryptV2(blob, deriveRecordKey("uview1someotherwallet"))).toThrow();
  });

  // GCM, so a file that was edited on disk does not open at all.
  it("refuses a file that has been tampered with", () => {
    const blob = encryptV2(RECORDS, deriveRecordKey(UFVK));
    blob[blob.length - 1] ^= 0xff;

    expect(() => decryptV2(blob, deriveRecordKey(UFVK))).toThrow();
  });

  // How a reader tells one of ours from a safeStorage blob, which begins with
  // Chromium's own version tag.
  it("knows its own files from the ones it is replacing", () => {
    expect(isV2(encryptV2(RECORDS, deriveRecordKey(UFVK)))).toBe(true);
    expect(isV2(Buffer.from("v10somethingchromiumwrote"))).toBe(false);
    expect(isV2(Buffer.alloc(0))).toBe(false);
    expect(isV2(null)).toBe(false);
  });

  it("does not write the same bytes twice for the same records", () => {
    const key = deriveRecordKey(UFVK);

    expect(encryptV2(RECORDS, key).equals(encryptV2(RECORDS, key))).toBe(false);
  });
});
