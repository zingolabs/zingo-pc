import { native } from "../electronBridge";
import { deriveWalletFingerprint } from "./walletFingerprint";

/**
 * The storage fingerprint of the wallet currently loaded in zingolib.
 *
 * Two callers need it and must agree: the provider that binds `SwapStore` to
 * the open wallet, and the delete flow that wipes that same bucket. A
 * fingerprint derived two slightly different ways would have the delete clear
 * a key nothing was ever written under, leaving the records behind exactly
 * when the user asked for them to be gone.
 *
 * Returns `""` when the UFVK cannot be read — no lightclient, a read-only
 * failure, a malformed reply. Callers must treat that as "no opinion" and skip
 * whatever they were going to do with it. Guessing a fingerprint here would
 * mean clearing some other wallet's bucket.
 *
 * The read goes through zingolib rather than the wallet registry because the
 * registry's id is local bookkeeping, while the bucket is keyed by the wallet's
 * own key material: the same seed restored twice must find its own records.
 */
export async function readCurrentWalletFingerprint(): Promise<string> {
  try {
    const raw: string = await native.get_ufvk();
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { ufvk?: string };
    return deriveWalletFingerprint(parsed.ufvk ?? "");
  } catch (error) {
    console.log(`readCurrentWalletFingerprint: could not read the UFVK ${error}`);
    return "";
  }
}
