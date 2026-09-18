/**
 * The chain of an address the wallet recognises but cannot swap with, by name,
 * or undefined.
 *
 * A scanned code from another wallet can carry an address on a chain SwapKit
 * does not route against ZEC (checked 2026-09-18: none of Maya, THORChain or
 * Monero appear in /swapTo or /swapFrom for ZEC.ZEC). Refusing it with "not an
 * address this wallet can save" reads like a reader that failed; naming the
 * chain says the address was read and why it goes nowhere.
 */
export function unswappableAddressChain(text: string): string | undefined {
  const trimmed = text.trim();
  const scheme = trimmed.match(/^([a-z][a-z0-9+.-]*):/i)?.[1].toLowerCase();
  const address = trimmed.replace(/^[a-z][a-z0-9+.-]*:(\/\/)?/i, "").split(/[?@/]/)[0];

  if (scheme === "monero" || /^[48][1-9A-HJ-NP-Za-km-z]{94}([1-9A-HJ-NP-Za-km-z]{11})?$/.test(address)) {
    return "Monero";
  }
  if (scheme === "thorchain" || /^thor1[02-9ac-hj-np-z]{38,}$/i.test(address)) return "THORChain (RUNE)";
  if (scheme === "mayachain" || scheme === "cacao" || /^maya1[02-9ac-hj-np-z]{38,}$/i.test(address)) {
    return "Maya (CACAO)";
  }
  return undefined;
}
