import { ipcRenderer } from "../electronBridge";

/**
 * The renderer's half of the encrypted swap store, shaped exactly like the
 * mobile wallet's `react-native-encrypted-storage` so `SwapStore` reads the
 * same against both. Encryption happens in the main process, where
 * `safeStorage` can reach the OS keychain.
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
