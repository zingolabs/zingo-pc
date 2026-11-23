import { ipcRenderer } from "../electronBridge";

/**
 * The storage fingerprint of the wallet currently loaded in zingolib.
 *
 * Two callers need it and must agree: the provider that binds `SwapStore` to
 * the open wallet, and the delete flow that wipes that same bucket. Main
 * derives it from the wallet's UFVK (`deriveWalletFingerprint` in
 * public/swapCrypto.js), so the UFVK itself never reaches the renderer.
 *
 * Returns `""` when it cannot be read — no lightclient, a read-only failure,
 * a malformed reply. Callers must treat that as "no opinion" and skip
 * whatever they were going to do with it. Guessing a fingerprint here would
 * mean clearing some other wallet's bucket.
 *
 * The bucket is keyed by the wallet's own key material rather than the
 * registry's local id: the same seed restored twice must find its own records.
 */
export async function readCurrentWalletFingerprint(): Promise<string> {
  try {
    const fingerprint: unknown = await ipcRenderer.invoke("wallet:fingerprint");
    return typeof fingerprint === "string" ? fingerprint : "";
  } catch (error) {
    console.log(`readCurrentWalletFingerprint: could not read it ${error}`);
    return "";
  }
}
