const crypto = require("crypto");

/**
 * How a wallet's swap records are encrypted on disk.
 *
 * They used to be encrypted with `safeStorage`, whose key belongs to the
 * installation: the OS keychain on macOS, the secret service on Linux, DPAPI
 * on Windows. That made the file unreadable anywhere but where it was written
 * — not only across the App Store sandbox boundary, where the keychain item
 * the DMG build created is out of reach, but also on a new machine, or after
 * restoring a backup. Swap history was the one part of a wallet that could not
 * travel with it.
 *
 * So the key comes from the wallet instead. It is derived from the wallet's
 * UFVK, which is the same material that names the file, and which any
 * installation holding the wallet can produce. The file then travels with the
 * wallet the way the transaction history does, and every migration is a copy.
 *
 * What that changes: the records are now as exposed as the wallet file itself.
 * That file already carries the viewing key — and, for a wallet with a seed,
 * the spending authority — so anyone who can read it has more than these
 * records could tell them. What is protected is what was protected before:
 * the records alone are meaningless bytes.
 *
 * AES-256-GCM, so a file that has been tampered with fails to open rather
 * than yielding altered records. The eight-byte magic is what tells a v2 file
 * from a `safeStorage` one, which never begins with it: the reader sniffs, and
 * an old file is read the old way and rewritten as v2 the next time its wallet
 * is open.
 */

const V2_MAGIC = Buffer.from("ZPCSWAP2", "ascii");
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

// Fixed, and distinct from anything else derived from a UFVK: the last 16
// characters of the same UFVK name the file (see walletFingerprint.ts), so the
// key must not be a function anyone could reach from the name.
const HKDF_SALT = Buffer.from("zingo-pc/swap-storage", "utf8");
const HKDF_INFO = Buffer.from("record encryption key v2", "utf8");

/** The record key for a wallet, from its UFVK. */
function deriveRecordKey(ufvk) {
  if (typeof ufvk !== "string" || ufvk.length === 0) return null;
  return Buffer.from(crypto.hkdfSync("sha256", Buffer.from(ufvk, "utf8"), HKDF_SALT, HKDF_INFO, KEY_BYTES));
}

/** Whether a file on disk is one of ours rather than a `safeStorage` blob. */
function isV2(buffer) {
  return (
    Buffer.isBuffer(buffer) && buffer.length > V2_MAGIC.length && buffer.subarray(0, V2_MAGIC.length).equals(V2_MAGIC)
  );
}

function encryptV2(plaintext, key) {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(plaintext, "utf8")), cipher.final()]);
  return Buffer.concat([V2_MAGIC, iv, cipher.getAuthTag(), ciphertext]);
}

function decryptV2(buffer, key) {
  const iv = buffer.subarray(V2_MAGIC.length, V2_MAGIC.length + IV_BYTES);
  const tag = buffer.subarray(V2_MAGIC.length + IV_BYTES, V2_MAGIC.length + IV_BYTES + TAG_BYTES);
  const ciphertext = buffer.subarray(V2_MAGIC.length + IV_BYTES + TAG_BYTES);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

module.exports = { V2_MAGIC, deriveRecordKey, isV2, encryptV2, decryptV2 };
