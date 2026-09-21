import { ipcRenderer } from "../electronBridge";

/**
 * The renderer's half of the encrypted swap store, shaped exactly like the
 * mobile wallet's `react-native-encrypted-storage` so `SwapStore` reads the
 * same against both. Encryption happens in the main process, which is where
 * the key can be derived and where the file is.
 *
 * The wallet's UFVK goes with each call, because the key comes from it: the
 * records belong to the wallet, so they are encrypted with it and travel with
 * it. Main falls back to its old installation-bound encryption when no UFVK is
 * given, which is the delete flow clearing a bucket by name — see
 * `public/swapCrypto.js` for what that costs and why it is worth it.
 *
 * `getItem` resolves `null` for a key that was never written, which is what
 * `SwapStore` treats as an empty bucket. Every other failure rejects: a store
 * that cannot read its records must not look like a store with no records, or
 * a live swap would vanish from the history mid-flight.
 */
const encryptedStorage = {
  getItem(key: string, ufvk?: string): Promise<string | null> {
    return ipcRenderer.invoke("swapStorage:get", key, ufvk);
  },

  setItem(key: string, value: string, ufvk?: string): Promise<void> {
    return ipcRenderer.invoke("swapStorage:set", key, value, ufvk);
  },

  removeItem(key: string): Promise<void> {
    return ipcRenderer.invoke("swapStorage:remove", key);
  },
};

export default encryptedStorage;
