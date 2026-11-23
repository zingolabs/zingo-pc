import { ipcRenderer } from "../electronBridge";

/**
 * The renderer's half of the encrypted swap store, shaped exactly like the
 * mobile wallet's `react-native-encrypted-storage` so `SwapStore` reads the
 * same against both. Encryption happens in the main process, which is where
 * the key can be derived and where the file is.
 *
 * The key comes from the open wallet's UFVK, which main reads itself and the
 * renderer never holds. Main uses it for that wallet's own bucket only, and
 * falls back to its installation-bound encryption for any other — the delete
 * flow clearing a bucket by name. See `public/swapCrypto.js`.
 *
 * `getItem` resolves `null` for a key that was never written, which is what
 * `SwapStore` treats as an empty bucket. Every other failure rejects: a store
 * that cannot read its records must not look like a store with no records, or
 * a live swap would vanish from the history mid-flight.
 */
const encryptedStorage = {
  getItem(key: string): Promise<string | null> {
    return ipcRenderer.invoke("swapStorage:get", key);
  },

  setItem(key: string, value: string): Promise<void> {
    return ipcRenderer.invoke("swapStorage:set", key, value);
  },

  removeItem(key: string): Promise<void> {
    return ipcRenderer.invoke("swapStorage:remove", key);
  },
};

export default encryptedStorage;
