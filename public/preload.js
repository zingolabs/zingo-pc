const { contextBridge, ipcRenderer, clipboard } = require("electron");
const { shell } = require("electron");
const fs = require("fs");
const path = require("path");

// In packaged app __dirname is inside app.asar; in dev it's the real public/ folder.
const nativePath = __dirname.includes(".asar")
  ? path.join(__dirname, "native.node")
  : path.join(__dirname, "../src/native.node");

const native = require(nativePath);

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
]);

contextBridge.exposeInMainWorld("electronAPI", {
  native,

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
    existsSync: (p) => fs.existsSync(p),
    promises: {
      mkdir: (p, opts) => fs.promises.mkdir(p, opts),
      writeFile: (p, data) => fs.promises.writeFile(p, data),
      readFile: (p) => fs.promises.readFile(p, "utf8"),
    },
  },
});
