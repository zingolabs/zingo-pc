// Which payment links the app may hand to the operating system.
//
// A swap deposit's QR carries a payment link (`ethereum:…`, `bitcoin:…`,
// `solana:…`). On a phone it is scanned; on a desktop the other wallet usually
// sits on the same computer, so the link is opened instead, and the OS passes
// it to whichever app is registered for its scheme.
//
// `shell.openExternal` will launch anything the OS knows how to open, so the
// renderer never reaches it with a free-form string. Only the schemes the
// deposit QR builds are let through, in the shapes it builds them, with no
// whitespace or control characters. `zcash:` is not among them: it would open
// this app, and a ZEC deposit is paid from this wallet, never from a link.
// Kept out of electron.js so it can be tested without Electron.

const MAX_PAYMENT_URI_LENGTH = 2048;

const PAYMENT_URI_PATTERNS = [
  // EIP-681, with or without the calldata carrying a memo.
  /^ethereum:0x[0-9a-fA-F]{40}@\d+\?value=\d+(&data=0x[0-9a-fA-F]*)?$/,
  // BIP-21 and the UTXO chains that copy it.
  /^(bitcoin|litecoin|dogecoin|dash|bitcoincash):[0-9A-Za-z:]+\?amount=\d+(\.\d+)?$/,
  // Solana Pay.
  /^solana:[1-9A-HJ-NP-Za-km-z]+\?amount=\d+(\.\d+)?$/,
  // TON transfer links.
  /^ton:\/\/transfer\/[0-9A-Za-z_:-]+\?amount=\d+$/,
];

function isOpenablePaymentUri(uri) {
  return (
    typeof uri === "string" &&
    uri.length <= MAX_PAYMENT_URI_LENGTH &&
    PAYMENT_URI_PATTERNS.some((pattern) => pattern.test(uri))
  );
}

module.exports = { isOpenablePaymentUri, MAX_PAYMENT_URI_LENGTH };
