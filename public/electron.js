const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require("electron");
const os = require("os");
const path = require("path");
const fs = require("fs");
const settings = require("electron-settings");
const storage = require("electron-json-storage");

const STORAGE_KEY = "wallets";
const isDev = !app.isPackaged;

class MenuBuilder {
  mainWindow;

  constructor(mainWindow) {
    this.mainWindow = mainWindow;
  }

  buildMenu() {
    const template = process.platform === "darwin" ? this.buildDarwinTemplate() : this.buildDefaultTemplate();

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    const selectionMenu = Menu.buildFromTemplate([{ role: "copy" }, { type: "separator" }, { role: "selectall" }]);

    const inputMenu = Menu.buildFromTemplate([
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { type: "separator" },
      { role: "selectall" },
    ]);

    this.mainWindow.webContents.on("context-menu", (_e, props) => {
      const { selectionText, isEditable } = props;
      if (isEditable) {
        inputMenu.popup(this.mainWindow);
      } else if (selectionText && selectionText.trim() !== "") {
        selectionMenu.popup(this.mainWindow);
      } else if (process.env.NODE_ENV === "development" || process.env.DEBUG_PROD === "true") {
        const { x, y } = props;

        Menu.buildFromTemplate([
          {
            label: "Inspect element",
            click: () => {
              this.mainWindow.inspectElement(x, y);
            },
          },
        ]).popup(this.mainWindow);
      }
    });

    return menu;
  }

  buildDarwinTemplate() {
    const { mainWindow } = this;

    const subMenuAbout = {
      label: "Zingo PC",
      submenu: [
        {
          label: "About Zingo PC",
          selector: "orderFrontStandardAboutPanel:",
          click: () => {
            mainWindow.webContents.send("about");
          },
        },
        { type: "separator" },
        { label: "Services", submenu: [] },
        { type: "separator" },
        {
          label: "Hide Zingo PC",
          accelerator: "Command+H",
          selector: "hide:",
        },
        {
          label: "Hide Others",
          accelerator: "Command+Shift+H",
          selector: "hideOtherApplications:",
        },
        { label: "Show All", selector: "unhideAllApplications:" },
        { type: "separator" },
        {
          label: "Quit",
          accelerator: "Command+Q",
          click: () => {
            app.quit();
          },
        },
      ],
    };
    const subMenuEdit = {
      label: "Edit",
      submenu: [
        { label: "Undo", accelerator: "Command+Z", selector: "undo:" },
        { label: "Redo", accelerator: "Shift+Command+Z", selector: "redo:" },
        { type: "separator" },
        { label: "Cut", accelerator: "Command+X", selector: "cut:" },
        { label: "Copy", accelerator: "Command+C", selector: "copy:" },
        { label: "Paste", accelerator: "Command+V", selector: "paste:" },
        {
          label: "Select All",
          accelerator: "Command+A",
          selector: "selectAll:",
        },
      ],
    };
    const subMenuWallet = {
      label: "Wallet",
      submenu: [
        {
          label: "&Add new Wallet",
          accelerator: "Ctrl+A",
          click: () => {
            mainWindow.webContents.send("addnewwallet");
          },
        },
        { type: "separator" },
        {
          label: "Wallet &Seed Phrase / Viewing Key",
          accelerator: "Ctrl+S",
          click: () => {
            mainWindow.webContents.send("seed");
          },
        },
        {
          label: "&Rescan Wallet",
          accelerator: "Ctrl+R",
          click: () => {
            mainWindow.webContents.send("rescan");
          },
        },
        {
          label: "&Wallet Settings",
          accelerator: "Ctrl+W",
          click: () => {
            mainWindow.webContents.send("settingswallet");
          },
        },
        {
          label: "&Delete Wallet",
          accelerator: "Ctrl+D",
          click: () => {
            mainWindow.webContents.send("deletewallet");
          },
        },
        { type: "separator" },
        {
          label: "&Pay URI",
          accelerator: "Ctrl+P",
          click: () => {
            mainWindow.webContents.send("payuri");
          },
        },
      ],
    };
    const subMenuSettings = {
      label: "Settings",
      submenu: [
        {
          label: "Select Block &Explorer",
          accelerator: "Ctrl+E",
          click: () => {
            mainWindow.webContents.send("blockexplorer");
          },
        },
        { type: "separator" },
        {
          label: "App &Security",
          accelerator: "Ctrl+Shift+S",
          click: () => {
            mainWindow.webContents.send("appsecurity");
          },
        },
      ],
    };
    const subMenuWindow = {
      label: "Window",
      submenu: [
        {
          label: "Minimize",
          accelerator: "Command+M",
          selector: "performMiniaturize:",
        },
        { label: "Close", accelerator: "Command+W", selector: "performClose:" },
        { type: "separator" },
        { label: "Bring All to Front", selector: "arrangeInFront:" },
      ],
    };
    const subMenuHelp = {
      label: "Help",
      submenu: [
        {
          label: "Check github.com for updates",
          click() {
            shell.openExternal("https://github.com/zingolabs/zingo-pc");
          },
        },
        {
          label: "File a bug...",
          click() {
            shell.openExternal("https://github.com/zingolabs/zingo-pc/issues");
          },
        },
      ],
    };

    return [subMenuAbout, subMenuEdit, subMenuWallet, subMenuSettings, subMenuWindow, subMenuHelp];
  }

  buildDefaultTemplate() {
    const { mainWindow } = this;

    const templateDefault = [
      {
        label: "&File",
        submenu: [
          {
            label: "&Pay URI",
            accelerator: "Ctrl+P",
            click: () => {
              mainWindow.webContents.send("payuri");
            },
          },
          {
            label: "&Close",
            accelerator: "Ctrl+C",
            click: () => {
              mainWindow.close();
            },
          },
        ],
      },
      {
        label: "&Wallet",
        submenu: [
          {
            label: "&Add new Wallet",
            accelerator: "Ctrl+A",
            click: () => {
              mainWindow.webContents.send("addnewwallet");
            },
          },
          { type: "separator" },
          {
            label: "Wallet &Seed Phrase / Viewing Key",
            accelerator: "Ctrl+S",
            click: () => {
              mainWindow.webContents.send("seed");
            },
          },
          {
            label: "&Rescan Wallet",
            accelerator: "Ctrl+R",
            click: () => {
              mainWindow.webContents.send("rescan");
            },
          },
          {
            label: "&Wallet Settings",
            accelerator: "Ctrl+W",
            click: () => {
              mainWindow.webContents.send("settingswallet");
            },
          },
          { type: "separator" },
          {
            label: "&Delete Wallet",
            accelerator: "Ctrl+D",
            click: () => {
              mainWindow.webContents.send("deletewallet");
            },
          },
        ],
      },
      {
        label: "&Settings",
        submenu: [
          {
            label: "Select Block &Explorer",
            accelerator: "Ctrl+E",
            click: () => {
              mainWindow.webContents.send("blockexplorer");
            },
          },
          { type: "separator" },
          {
            label: "App &Security",
            accelerator: "Ctrl+Shift+S",
            click: () => {
              mainWindow.webContents.send("appsecurity");
            },
          },
        ],
      },
      {
        label: "Help",
        submenu: [
          {
            label: "About Zingo PC",
            click: () => {
              mainWindow.webContents.send("about");
            },
          },
          {
            label: "Check github.com for updates",
            click() {
              shell.openExternal("https://github.com/zingolabs/zingo-pc/releases");
            },
          },
          {
            label: "File a bug...",
            click() {
              shell.openExternal("https://github.com/zingolabs/zingo-pc/issues");
            },
          },
        ],
      },
    ];

    return templateDefault;
  }
}

async function getWallets() {
  return new Promise((resolve, reject) => {
    storage.get(STORAGE_KEY, (err, data) => {
      if (err) return reject(err);
      resolve(Array.isArray(data) ? data : []);
    });
  });
}

async function getWallet(id) {
  const wallets = await getWallets();
  return wallets.filter((w) => w.id === id);
}

async function addWallet(wallet) {
  const wallets = await getWallets();
  wallets.push(wallet);
  await saveWallets(wallets);
}

async function updateWallet(wallet) {
  const wallets = await getWallets();
  const temp = wallets.filter((w) => w.id !== wallet.id);
  temp.push(wallet);
  await saveWallets(temp);
}

async function removeWallet(id) {
  const wallets = await getWallets();
  const filtered = wallets.filter((w) => w.id !== id);
  await saveWallets(filtered);
}

async function clearWallets() {
  return new Promise((resolve, reject) => {
    storage.remove(STORAGE_KEY, (err) => (err ? reject(err) : resolve()));
  });
}

async function saveWallets(wallets) {
  return new Promise((resolve, reject) => {
    storage.set(STORAGE_KEY, wallets, (err) => (err ? reject(err) : resolve()));
  });
}

// IPC close-state lives at module level so it survives across createWindow calls on macOS
let waitingForClose = false;
let proceedToClose = false;

// zcash: URI received before the renderer is ready (cold start or wallet not yet loaded)
let pendingZcashUri = null;

function handleZcashUri(uri) {
  if (!uri || !uri.startsWith("zcash:")) return;
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    win.webContents.send("payuri", uri);
  } else {
    pendingZcashUri = uri;
  }
}

// Electron 37+ (Chromium 137+) initialises CoreLocation in every process when running
// under MAS sandbox. The sandbox denies com.apple.locationd.desktop.registration,
// causing startup hangs of varying lengths across processes:
//   - main thread deadlock  → fixed by NetworkServiceInProcess (moves Network Service
//     out of the main process so CL is no longer initialised on the main thread)
//   - ~91 s renderer delay  → fixed by disable-geolocation (prevents CL in renderer)
//   - ~57 s renderer delay  → fixed by NetworkLocationProvider (prevents CL in the
//     separate Network Service process, which was still timing out and blocking the
//     renderer's Mojo IPC connection to it)
//   - ~10 s remaining delay → fixed by com.apple.security.personal-information.location
//     entitlement (v128): allows CL to connect to locationd immediately instead of
//     waiting for the 10 s registration timeout.
//   DO NOT add "Geolocation" to disable-features — it forces CL to initialise
//   synchronously on the main thread (dispatch_once deadlock, v126 lesson).
//   DO NOT use show:false+ready-to-show — macOS state restoration bypasses it and
//   shows the window before the renderer is ready, breaking the React render pipeline
//   (v126/v127 lesson).
// Zingo PC does not use location services, so all three flags can be safely disabled.
if (process.platform === "darwin") {
  app.commandLine.appendSwitch("disable-features", "NetworkServiceInProcess,NetworkLocationProvider");
  app.commandLine.appendSwitch("disable-geolocation");
}

// On Linux, detect kernel-level user namespace restrictions (Ubuntu 22.04+, Debian 11+)
// and disable Chromium's process sandbox when they are in place. Without this the app
// shows a blank blue screen on affected distros (issues #206, #266).
// Note: Ubuntu 24.04 uses AppArmor instead of this sysctl — the .deb postinstall
// fixes that case via chrome-sandbox SUID. AppImage users on 24.04 may still need
// to run with --no-sandbox manually if AppArmor blocks user namespaces.
if (process.platform === "linux") {
  try {
    const val = fs.readFileSync("/proc/sys/kernel/unprivileged_userns_clone", "utf8").trim();
    if (val === "0") app.commandLine.appendSwitch("no-sandbox");
  } catch {
    /* sysctl not present — sandbox should work */
  }
}

// Mac/MAS only: the OS routes zcash: links here whether the app is open or closed.
// Must be registered before app.whenReady() to catch cold-start links.
// On Windows/Linux, URIs arrive via second-instance argv — open-url is not fired there.
if (process.platform === "darwin") {
  app.on("open-url", (event, url) => {
    event.preventDefault();
    handleZcashUri(url);
  });
}

// Windows/Linux: enforce single instance and receive the URI from the second argv.
// Not used on macOS — the OS handles single-instance for URL schemes via open-url.
if (process.platform !== "darwin") {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    // Exit immediately — app.quit() is graceful and can briefly show a white
    // window before the process terminates, which is visible to the user.
    app.exit(0);
  } else {
    app.on("second-instance", (_event, argv) => {
      const uri = argv.find((a) => a.startsWith("zcash:"));
      if (uri) handleZcashUri(uri);
      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        if (win.isMinimized()) win.restore();
        win.focus();
      }
    });
  }
}

// Register all IPC handlers once — calling ipcMain.handle twice for the same channel throws

ipcMain.handle("auth:check", async () => {
  if (process.platform === "win32") {
    try {
      return getNative().checkWindowsHello();
    } catch {
      return "not_supported";
    }
  } else if (process.platform === "darwin") {
    try {
      return getNative().checkMacAuth();
    } catch {
      return "not_supported";
    }
  } else if (process.platform === "linux") {
    return new Promise((resolve) => {
      const { execFile } = require("child_process");
      // polkit 0.105 (Linux Mint / Ubuntu) exits with code 1 even when the
      // action exists, so check stdout instead of the exit code.
      execFile("pkaction", ["--action-id", "co.zingo.pc.authenticate"], (_err, stdout) => {
        resolve(stdout && stdout.includes("co.zingo.pc.authenticate") ? "available" : "not_installed_linux");
      });
    });
  }
  return "not_supported";
});

ipcMain.handle("auth:verify", async (_e, reason) => {
  if (process.platform === "win32") {
    const win = BrowserWindow.getAllWindows()[0] ?? null;
    try {
      const native = getNative();
      // If Windows Hello is not configured, skip verification rather than hanging.
      if (native.checkWindowsHello() !== "available") return { success: true };
      // Blur the Electron window so the Windows Hello dialog can take foreground focus.
      if (win) win.blur();
      const result = await native.verifyWindowsUser(String(reason));
      if (win) win.focus();
      return result;
    } catch {
      if (win) win.focus();
      return { success: false };
    }
  } else if (process.platform === "darwin") {
    try {
      return await getNative().verifyMacUser(String(reason));
    } catch {
      return { success: false };
    }
  } else if (process.platform === "linux") {
    return new Promise((resolve) => {
      const { execFile } = require("child_process");
      execFile(
        "pkcheck",
        ["--action-id", "co.zingo.pc.authenticate", "--process", String(process.pid), "--allow-user-interaction"],
        (err) => resolve({ success: !err }),
      );
    });
  }
  return { success: false };
});

// ── Keychain-backed requireDeviceAuth ─────────────────────────────────────
// Missing or deleted entry is treated as true (auth required by default).
// Only an explicit "false" stored by the user disables the feature.
const KEYTAR_SERVICE = "Zingo PC";
const KEYTAR_ACCOUNT = "requireDeviceAuth";

async function getRequireAuth() {
  try {
    const keytar = require("keytar");
    const value = await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
    if (value === null) return true;
    return value === "true";
  } catch {
    // libsecret unavailable (Linux AppImage, etc.) → fall back to settings.json, default true
    return settings.getSync("all.requireDeviceAuth") ?? true;
  }
}

async function setRequireAuth(value) {
  try {
    const keytar = require("keytar");
    await keytar.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT, value ? "true" : "false");
    settings.unsetSync("all.requireDeviceAuth");
  } catch {
    settings.setSync("all.requireDeviceAuth", value);
  }
}

ipcMain.handle("loadSettings", async () => {
  const all = settings.getSync("all");
  const requireDeviceAuth = await getRequireAuth();
  return { ...(all ?? {}), requireDeviceAuth };
});
ipcMain.handle("saveSettings", async (_e, kv) => {
  if (kv.key === "requireDeviceAuth") {
    await setRequireAuth(kv.value);
  } else {
    settings.setSync(`all.${kv.key}`, kv.value);
  }
});
ipcMain.handle("wallets:all", async () => getWallets());
ipcMain.handle("wallets:get", async (_e, id) => getWallet(id));
ipcMain.handle("wallets:add", async (_e, wallet) => addWallet(wallet));
ipcMain.handle("wallets:update", async (_e, wallet) => updateWallet(wallet));
ipcMain.handle("wallets:remove", async (_e, id) => removeWallet(id));
ipcMain.handle("wallets:clear", async () => clearWallets());
ipcMain.handle("get-app-data-path", () => app.getPath("appData"));
ipcMain.handle("fs:existsSync", (_e, p) => fs.existsSync(p));
ipcMain.handle("fs:mkdir", (_e, p, opts) => fs.promises.mkdir(p, opts));
ipcMain.handle("fs:writeFile", (_e, p, data) => fs.promises.writeFile(p, data));
ipcMain.handle("fs:readFile", (_e, p) => fs.promises.readFile(p, "utf8"));

// Lazily loads native.node in the main process (shared across all IPC handlers).
// Path mirrors preload.js: inside an asar, Electron redirects .node loads to
// app.asar.unpacked/ automatically (asarUnpack: ["build/native.node"]).
const _nativePath = __dirname.includes(".asar")
  ? path.join(__dirname, "native.node")
  : path.join(__dirname, "../src/native.node");

let _mainNative = null;
function getNative() {
  if (!_mainNative) {
    try {
      _mainNative = require(_nativePath);
    } catch (_) {}
  }
  return _mainNative;
}

// Activates a security-scoped bookmark from the main process, which has
// com.apple.security.files.bookmarks.app-scope explicitly. Apple docs say
// app-scoped bookmark access applies to all processes in the app sandbox.
function activateBookmarkInMainProcess(bookmarkB64, wdLog) {
  const native = getNative();
  if (native && typeof native.start_security_scoped_access === "function") {
    const ok = native.start_security_scoped_access(bookmarkB64);
    wdLog(`main-process start_security_scoped_access=${ok}`);
  }
}

// ── zingolib native IPC handlers (async no-param methods) ─────────────────
// These route native.node calls from the renderer through the main process.
// Sync no-param methods (deinitialize, set_crypto_default_provider_to_ring, etc.)
// and methods with parameters are handled in subsequent refactor phases.
const _NATIVE_NO_PARAM_METHODS = [
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
];

for (const method of _NATIVE_NO_PARAM_METHODS) {
  ipcMain.handle(`native:${method}`, () => {
    const native = getNative();
    if (!native || typeof native[method] !== "function") {
      throw new Error(`native.${method} not available`);
    }
    return native[method]();
  });
}

// Sync no-param methods (also routed to main — become async over IPC)
for (const method of [
  "deinitialize",
  "get_developer_donation_address",
  "get_zennies_for_zingo_donation_address",
  "set_crypto_default_provider_to_ring",
]) {
  ipcMain.handle(`native:${method}`, () => {
    const native = getNative();
    if (!native || typeof native[method] !== "function") {
      throw new Error(`native.${method} not available`);
    }
    return native[method]();
  });
}

// Methods with parameters
ipcMain.handle("native:wallet_exists", (_e, server_uri, chain_hint, perf, min_conf, wallet_name) =>
  getNative().wallet_exists(server_uri, chain_hint, perf, min_conf, wallet_name),
);
ipcMain.handle("native:init_new", (_e, server_uri, chain_hint, perf, min_conf, wallet_name) =>
  getNative().init_new(server_uri, chain_hint, perf, min_conf, wallet_name),
);
ipcMain.handle("native:init_from_seed", (_e, seed, birthday, server_uri, chain_hint, perf, min_conf, wallet_name) =>
  getNative().init_from_seed(seed, birthday, server_uri, chain_hint, perf, min_conf, wallet_name),
);
ipcMain.handle("native:init_from_ufvk", (_e, ufvk, birthday, server_uri, chain_hint, perf, min_conf, wallet_name) =>
  getNative().init_from_ufvk(ufvk, birthday, server_uri, chain_hint, perf, min_conf, wallet_name),
);
ipcMain.handle("native:init_from_b64", (_e, server_uri, chain_hint, perf, min_conf, wallet_name) =>
  getNative().init_from_b64(server_uri, chain_hint, perf, min_conf, wallet_name),
);
ipcMain.handle("native:set_wallet_base_dir", (_e, dirPath) => getNative().set_wallet_base_dir(dirPath));
ipcMain.handle("native:start_security_scoped_access", (_e, bookmark_b64) =>
  getNative().start_security_scoped_access(bookmark_b64),
);
ipcMain.handle("native:get_latest_block_server", (_e, server_uri) => getNative().get_latest_block_server(server_uri));
ipcMain.handle("native:parse_address", (_e, address) => getNative().parse_address(address));
ipcMain.handle("native:parse_ufvk", (_e, ufvk) => getNative().parse_ufvk(ufvk));
ipcMain.handle("native:get_messages", (_e, address) => getNative().get_messages(address));
ipcMain.handle("native:zec_price", (_e, tor) => getNative().zec_price(tor));
ipcMain.handle("native:remove_transaction", (_e, txid) => getNative().remove_transaction(txid));
ipcMain.handle("native:get_spendable_balance_with_address", (_e, address, zennies) =>
  getNative().get_spendable_balance_with_address(address, zennies),
);
ipcMain.handle("native:create_new_unified_address", (_e, receivers) =>
  getNative().create_new_unified_address(receivers),
);
ipcMain.handle("native:set_config_wallet_to_prod", (_e, perf, min_conf) =>
  getNative().set_config_wallet_to_prod(perf, min_conf),
);
ipcMain.handle("native:send", (_e, send_json) => getNative().send(send_json));
ipcMain.handle("native:delete_wallet", (_e, server_uri, chain_hint, perf, min_conf, wallet_name) =>
  getNative().delete_wallet(server_uri, chain_hint, perf, min_conf, wallet_name),
);
ipcMain.handle("native:create_tor_client", (_e, data_dir) => getNative().create_tor_client(data_dir));
ipcMain.handle("native:change_server", (_e, server_uri) => getNative().change_server(server_uri));

ipcMain.handle("wallet-dir:request", async () => {
  const wdLog = (msg) => {
    try {
      const logPath = require("path").join(app.getPath("userData"), "startup.log");
      require("fs").appendFileSync(logPath, `${new Date().toISOString()} [wallet-dir] ${msg}\n`);
    } catch (_) {}
  };
  try {
    // process.mas is set by Electron in ALL processes (main + renderer) for MAS/TestFlight builds.
    // APP_SANDBOX_CONTAINER_ID is only reliable in renderer processes, not in the main process.
    wdLog(`handler entered — process.mas=${process.mas} platform=${process.platform}`);
    if (process.platform !== "darwin" || !process.mas) {
      wdLog("returning null (not MAS darwin)");
      return null;
    }

    // os.homedir() inside MAS sandbox returns the container home, not the real user home.
    // os.userInfo().username is reliable regardless of sandbox and gives the real username.
    const realHome = path.join("/Users", os.userInfo().username);
    const zcashDir = path.join(realHome, "Library", "Application Support", "Zcash");
    const mainWindow = BrowserWindow.getAllWindows()[0] ?? null;
    wdLog(`zcashDir=${zcashDir} mainWindow=${mainWindow ? "ok" : "null"}`);

    // Return stored bookmark if available (subsequent launches).
    // settings.get() is async in electron-settings v4 — always use getSync() here to
    // avoid returning an unresolved Promise which fails IPC structured clone.
    const storedBookmark = settings.getSync("all.walletDirBookmark");
    wdLog(
      `storedBookmark type=${typeof storedBookmark} hasValue=${typeof storedBookmark === "string" && storedBookmark.length > 0}`,
    );
    if (typeof storedBookmark === "string" && storedBookmark.length > 0) {
      wdLog("returning stored bookmark");
      activateBookmarkInMainProcess(storedBookmark, wdLog);
      return {
        path: String(settings.getSync("all.walletDirPath") ?? ""),
        bookmark: storedBookmark,
      };
    }

    // First launch: info dialog → folder picker loop
    wdLog("showing first-launch dialog");
    while (true) {
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "Wallet folder access",
        message: "Zingo needs access to the wallet folder",
        detail: `Your wallets are stored in:\n${zcashDir}\n\nIn the next screen, select that folder and click "Confirm".`,
        buttons: ["Continue", "Quit Zingo"],
        defaultId: 0,
        cancelId: 1,
      });

      if (response === 1) {
        app.quit();
        return null;
      }

      const { canceled, filePaths, bookmarks } = await dialog.showOpenDialog(mainWindow, {
        title: "Select wallet folder",
        message: 'Select the "Zcash" folder and click "Confirm"',
        buttonLabel: "Confirm",
        defaultPath: zcashDir,
        properties: ["openDirectory", "createDirectory"],
        securityScopedBookmarks: true,
      });

      if (canceled || filePaths.length === 0) {
        const { response: r2 } = await dialog.showMessageBox(mainWindow, {
          type: "warning",
          title: "Access required",
          message: "Zingo cannot run without access to the wallet folder.",
          buttons: ["Retry", "Quit Zingo"],
          defaultId: 0,
          cancelId: 1,
        });
        if (r2 === 1) {
          app.quit();
          return null;
        }
        continue;
      }

      const selectedPath = filePaths[0];
      if (path.basename(selectedPath) !== "Zcash") {
        await dialog.showMessageBox(mainWindow, {
          type: "error",
          title: "Wrong folder",
          message: `Please select the "Zcash" folder, not "${path.basename(selectedPath)}".`,
          buttons: ["Retry"],
        });
        continue;
      }

      const bookmark = bookmarks[0];
      settings.setSync("all.walletDirBookmark", bookmark);
      settings.setSync("all.walletDirPath", selectedPath);
      wdLog(`bookmark stored, path=${selectedPath}`);
      activateBookmarkInMainProcess(bookmark, wdLog);
      return { path: selectedPath, bookmark };
    }
  } catch (e) {
    wdLog(`ERROR: ${e}`);
    console.error("wallet-dir:request handler error:", e);
    return null;
  }
});

// Renderer calls this once the wallet is loaded to claim any pending zcash: URI.
ipcMain.handle("get-pending-uri", () => {
  const uri = pendingZcashUri;
  pendingZcashUri = null;
  return uri;
});

ipcMain.on("apprestart", () => {
  app.relaunch({ args: process.argv.slice(1).concat(["--relaunch"]) });
  app.exit(0);
});

ipcMain.on("appquitdone", () => {
  waitingForClose = false;
  proceedToClose = true;
  app.quit();
});

function createWindow() {
  // Reset close state for the new window
  waitingForClose = false;
  proceedToClose = false;

  const mainWindow = new BrowserWindow({
    width: 1350,
    height: 700,
    minWidth: 1150,
    minHeight: 600,
    maxWidth: 1500,
    maxHeight: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      nodeIntegrationInWorker: false,
      enableRemoteModule: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  const ignore = process.platform !== "darwin";
  mainWindow.webContents.setIgnoreMenuShortcuts(ignore);

  // Load from localhost if in development
  // Otherwise load index.html file
  mainWindow.loadURL(isDev ? "http://localhost:3000" : `file://${path.join(__dirname, "../build/index.html")}`);

  // Diagnostic logging for MAS/sandbox builds — writes to userData so we can
  // read it from ~/Library/Containers/co.zingo.pc/Data/Library/Application Support/Zingo PC/startup.log
  if (!isDev) {
    const logPath = path.join(app.getPath("userData"), "startup.log");
    const ts = () => new Date().toISOString();
    const log = (msg) => {
      try {
        require("fs").appendFileSync(logPath, `${ts()} ${msg}\n`);
      } catch (_) {}
    };
    log(`=== startup bundleVersion=${app.getVersion()} ===`);
    mainWindow.webContents.on("did-start-loading", () => log("did-start-loading"));
    mainWindow.webContents.on("did-finish-load", () => log("did-finish-load OK"));
    mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) =>
      log(`did-fail-load code=${code} desc=${desc} url=${url}`),
    );
    mainWindow.webContents.on("dom-ready", () => log("dom-ready"));
    mainWindow.webContents.on("render-process-gone", (_e, details) =>
      log(`render-process-gone reason=${details.reason} exitCode=${details.exitCode}`),
    );
    app.on("render-process-gone", (_e, _wc, details) =>
      log(`app render-process-gone reason=${details.reason} exitCode=${details.exitCode}`),
    );
    mainWindow.webContents.on("console-message", (_e, level, message, line, sourceId) => {
      const src = sourceId ? sourceId.split("/").slice(-1)[0] : "?";
      log(`console[${level}] ${src}:${line} ${message}`);
    });
  }

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  mainWindow.on("close", (event) => {
    // If we are clear to close, then return and allow everything to close
    if (proceedToClose) {
      return;
    }

    // If we're already waiting for close, don't allow another close event to actually close the window
    if (waitingForClose) {
      console.log("Waiting for close... Timeout in 10s");
      event.preventDefault();
      return;
    }

    waitingForClose = true;
    event.preventDefault();

    mainWindow.webContents.send("appquitting");

    // Failsafe: if the renderer doesn't respond within 3s, force quit.
    setTimeout(() => {
      waitingForClose = false;
      proceedToClose = true;
      console.log("Timeout, quitting");
      app.quit();
    }, 3 * 1000);
  });

  // Open DevTools if in dev mode
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

app.commandLine.appendSwitch("in-process-gpu");

// Windows/Linux cold start: the zcash: URI arrives via env var (set by the
// zingo-pc-uri.sh wrapper on Linux, which avoids passing it as a positional
// argv that Electron's runtime misinterprets as the app-module path) or as a
// direct argv entry on Windows.
if (process.platform !== "darwin") {
  const envUri = process.env.ZINGO_PC_URI;
  const coldStartUri =
    envUri && envUri.startsWith("zcash:") ? envUri : process.argv.find((a) => a.startsWith("zcash:"));
  if (coldStartUri) pendingZcashUri = coldStartUri;
}

// Create a new browser window by invoking the createWindow
// function once the Electron application is initialized.
// Install REACT_DEVELOPER_TOOLS as well if isDev
app.whenReady().then(async () => {
  // Register zcash: protocol handler at runtime.
  // - MAS: handled declaratively via protocols in package.json (sandbox forbids this call).
  // - Flatpak: handled declaratively via the manifest .desktop file (sandbox forbids this call).
  // - Windows/Linux packaged: the installer registers it, but calling this too doesn't hurt.
  // - Dev mode on any platform: needed because electron-builder hasn't run.
  const isInSandbox = process.mas || !!process.env.FLATPAK_ID;
  if (!isInSandbox) {
    if (process.defaultApp) {
      // Dev mode on Windows/Linux: register so URIs reach this instance via second-instance.
      // Skipped on macOS: cold-start doesn't work in dev anyway, and registering here would
      // overwrite the installed app's (DMG/TF) handler in the Launch Services database.
      if (process.platform !== "darwin") {
        app.setAsDefaultProtocolClient("zcash", process.execPath, [app.getAppPath()]);
      }
    } else {
      // On Linux, the packaged Electron binary treats any positional argument
      // as the app-module path (defaultApp mode), so passing the zcash: URI
      // directly as argv causes a crash.  Register the wrapper script instead;
      // it forwards the URI via the ZINGO_PC_URI env var and starts the binary
      // with no positional arguments.
      if (process.platform === "linux") {
        const wrapperPath = path.join(path.dirname(process.execPath), "resources", "zingo-pc-uri.sh");
        if (fs.existsSync(wrapperPath)) {
          app.setAsDefaultProtocolClient("zcash", wrapperPath);
        } else {
          app.setAsDefaultProtocolClient("zcash");
        }
      } else {
        app.setAsDefaultProtocolClient("zcash");
      }
    }
  }

  if (isDev) {
    try {
      // v4: export nombrado
      const mod = await import("electron-devtools-installer");
      const installExtension = mod.installExtension ?? mod.default; // compat v3/v4
      const { REACT_DEVELOPER_TOOLS } = mod;

      if (typeof installExtension !== "function") {
        throw new TypeError("installExtension export not found");
      }

      const ext = await installExtension(REACT_DEVELOPER_TOOLS);
      console.log(`React DevTools instalado: ${ext?.name ?? ext}`);
    } catch (e) {
      console.warn("Devtools not installed (ok in prod):", e?.message ?? e);
    }
  }

  createWindow();
});

// Add a new listener that tries to quit the application when
// it no longer has any open windows. This listener is a no-op
// on macOS due to the operating system's window management behavior.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Add a new listener that creates a new browser window only if
// when the application has no visible windows after being activated.
// For example, after launching the application for the first time,
// or re-launching the already running application.
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// The code above has been adapted from a starter example in the Electron docs:
// https://www.electronjs.org/docs/tutorial/quick-start#create-the-main-script-file
