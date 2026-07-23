// With sandbox: true on BrowserWindow, only a subset of Electron's API is available
// in the preload — `shell` and `clipboard` are NOT available here, so they are
// proxied to the main process via IPC (see ALLOWED_INVOKE below).
const { contextBridge, ipcRenderer } = require("electron");

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
  "get_unified_addresses",
  "get_transparent_addresses",
  "create_new_transparent_address",
  "get_wallet_save_required",
  "set_config_wallet_to_test",
  "get_config_wallet_performance",
  "get_wallet_version",
  "shield",
  "confirm",
  "drain_orchard_to_ironwood",
  "drain_status",
  "get_ironwood_activation_height",
  "plan_orchard_drain",
  // private Ironwood migration (parts/buckets engine), no params
  "plan_ironwood_migration",
  "continue_note_splitting",
  "migration_status",
  "reconcile_migration",
  "broadcast_due_parts",
  "auto_broadcast_if_due",
  "catch_up_migration",
  "migrate_to_ironwood",
  "cancel_ironwood_migration",
  "reschedule_overdue_forward",
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
  "change_server",
  "start_ironwood_migration",
  "reschedule_parts",
  // sync with params (become async via IPC)
  "wallet_exists",
  "init_new",
  "init_from_seed",
  "init_from_ufvk",
  "init_from_b64",
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
  "change-wallet-dir",
  "import-data",
]);

// Allowed IPC channels that renderer → main can invoke/send.
const ALLOWED_INVOKE = new Set([
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
  "shell:openExternal",
  "clipboard:writeText",
  "wallet-dir:change",
  "import:scan",
  "import:apply",
  "zns:resolve",
  "save-png",
]);

contextBridge.exposeInMainWorld("electronAPI", {
  native: nativeForRenderer,
  isSandboxed: process.platform === "darwin" && process.mas === true,

  clipboard: {
    writeText: (text) => ipcRenderer.invoke("clipboard:writeText", text),
  },

  shell: {
    openExternal: (url) => {
      // Only allow https:// URLs to prevent protocol injection.
      // Main process re-validates as defense in depth.
      if (typeof url === "string" && url.startsWith("https://")) {
        return ipcRenderer.invoke("shell:openExternal", url);
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
