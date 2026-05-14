const { contextBridge, ipcRenderer, clipboard } = require("electron");
const { shell } = require("electron");

// All native methods run in the main process — every call is an IPC round-trip.
// This allows sandbox:true on BrowserWindow and correct security-scoped bookmark handling.
const _ALL_NATIVE_METHODS = [
  // async, no params
  "save_wallet_file",
  "check_save_error",
  "get_seed",
  "get_ufvk",
  "get_latest_block_wallet",
  "get_value_transfers",
  "poll_sync",
  "run_sync",
  "pause_sync",
  "stop_sync",
  "status_sync",
  "run_rescan",
  "info_server",
  "wallet_kind",
  "get_version",
  "get_balance",
  "get_total_memobytes_to_address",
  "get_total_value_to_address",
  "get_total_spends_to_address",
  "get_spendable_balance_total",
  "set_option_wallet",
  "get_option_wallet",
  "remove_tor_client",
  "get_unified_addresses",
  "get_transparent_addresses",
  "create_new_transparent_address",
  "check_my_address",
  "get_wallet_save_required",
  "set_config_wallet_to_test",
  "get_config_wallet_performance",
  "get_wallet_version",
  "shield",
  "confirm",
  // sync no-param (become async via IPC)
  "deinitialize",
  "get_developer_donation_address",
  "get_zennies_for_zingo_donation_address",
  "set_crypto_default_provider_to_ring",
  // async with params
  "get_latest_block_server",
  "parse_address",
  "parse_ufvk",
  "get_messages",
  "zec_price",
  "remove_transaction",
  "get_spendable_balance_with_address",
  "create_new_unified_address",
  "set_config_wallet_to_prod",
  "send",
  "delete_wallet",
  "create_tor_client",
  "change_server",
  // sync with params (become async via IPC)
  "wallet_exists",
  "init_new",
  "init_from_seed",
  "init_from_ufvk",
  "init_from_b64",
  "set_wallet_base_dir",
  "start_security_scoped_access",
];

const nativeForRenderer = {};
for (const method of _ALL_NATIVE_METHODS) {
  nativeForRenderer[method] = (...args) => ipcRenderer.invoke(`native:${method}`, ...args);
}

// Allowed IPC channels that main → renderer can push.
const ALLOWED_RECEIVE = new Set([
  "about",
  "payuri",
  "blockexplorer",
  "seed",
  "rescan",
  "addnewwallet",
  "settingswallet",
  "deletewallet",
  "appquitting",
  "appsecurity",
]);

// Allowed IPC channels that renderer → main can invoke/send.
const ALLOWED_INVOKE = new Set([
  "native:get_seed",
  "native:get_ufvk",
  "loadSettings",
  "saveSettings",
  "wallets:all",
  "wallets:get",
  "wallets:add",
  "wallets:update",
  "wallets:remove",
  "wallets:clear",
  "get-app-data-path",
  "get-pending-uri",
  "apprestart",
  "appquitdone",
  "auth:check",
  "auth:verify",
  "wallet-dir:request",
  "fs:existsSync",
  "fs:mkdir",
  "fs:writeFile",
  "fs:readFile",
]);

contextBridge.exposeInMainWorld("electronAPI", {
  native: nativeForRenderer,
  isSandboxed: process.platform === "darwin" && process.mas === true,

  clipboard: {
    writeText: (text) => clipboard.writeText(text),
  },

  shell: {
    openExternal: (url) => {
      // Only allow https:// URLs to prevent protocol injection.
      if (typeof url === "string" && url.startsWith("https://")) {
        shell.openExternal(url);
      }
    },
  },

  ipcRenderer: {
    on: (channel, listener) => {
      if (ALLOWED_RECEIVE.has(channel)) {
        ipcRenderer.on(channel, listener);
      }
    },
    off: (channel, listener) => {
      if (ALLOWED_RECEIVE.has(channel)) {
        ipcRenderer.off(channel, listener);
      }
    },
    removeListener: (channel, listener) => {
      if (ALLOWED_RECEIVE.has(channel)) {
        ipcRenderer.removeListener(channel, listener);
      }
    },
    invoke: (channel, ...args) => {
      if (ALLOWED_INVOKE.has(channel)) {
        return ipcRenderer.invoke(channel, ...args);
      }
      return Promise.reject(new Error(`IPC channel not allowed: ${channel}`));
    },
    send: (channel, ...args) => {
      if (ALLOWED_INVOKE.has(channel)) {
        ipcRenderer.send(channel, ...args);
      }
    },
  },

  fs: {
    existsSync: (p) => ipcRenderer.invoke("fs:existsSync", p),
    promises: {
      mkdir: (p, opts) => ipcRenderer.invoke("fs:mkdir", p, opts),
      writeFile: (p, data) => ipcRenderer.invoke("fs:writeFile", p, data),
      readFile: (p) => ipcRenderer.invoke("fs:readFile", p),
    },
  },
});
