const { app, BrowserWindow, Menu, shell, ipcMain, dialog, session, clipboard } = require("electron");
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
        {
          label: "Change &Wallets Folder Location…",
          visible: process.mas === true,
          click: () => {
            mainWindow.webContents.send("change-wallet-dir");
          },
        },
        {
          label: "&Import Data from Another Installation…",
          visible: process.mas === true || !!process.env.FLATPAK_ID,
          click: () => {
            mainWindow.webContents.send("import-data");
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
          {
            label: "&Import Data from Another Installation…",
            visible: !!process.env.FLATPAK_ID,
            click: () => {
              mainWindow.webContents.send("import-data");
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

// Last sourceDir confirmed by the user through the system "Open" dialog in
// import:scan. import:apply rejects any sourceDir that doesn't exactly match —
// the renderer must not be able to fabricate this path. Resolved to canonical
// form so the comparison is path-separator and "."/".." agnostic.
let _lastScanSourceDir = null;

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
let sandboxDisabled = false;
if (process.platform === "linux") {
  try {
    const val = fs.readFileSync("/proc/sys/kernel/unprivileged_userns_clone", "utf8").trim();
    if (val === "0") {
      app.commandLine.appendSwitch("no-sandbox");
      sandboxDisabled = true;
    }
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

// Enforce single instance across all platforms.
// On macOS, the OS usually focuses the existing instance via Launch Services,
// but two copies of the app at different paths (e.g. DMG + MAS) can both run
// and end up sharing native/GPU resources — which has caused shutdown crashes
// in the InProc GPU thread (rust_png / fontations).
// Windows/Linux also use this to receive zcash: URIs from second-instance argv.
{
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
  // Race any platform probe against a 3s timeout so a hung native call
  // (e.g. Windows Hello on a system without it configured) doesn't block
  // the renderer's lock-check forever and leave a white screen.
  const withTimeout = (probe, fallback = "not_supported", ms = 3000) =>
    Promise.race([
      Promise.resolve().then(() => probe()),
      new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
    ]).catch(() => fallback);

  if (process.platform === "win32") {
    return withTimeout(() => getNative().checkWindowsHello());
  } else if (process.platform === "darwin") {
    return withTimeout(() => getNative().checkMacAuth());
  } else if (process.platform === "linux") {
    return withTimeout(
      () =>
        new Promise((resolve) => {
          const { execFile } = require("child_process");
          // polkit 0.105 (Linux Mint / Ubuntu) exits with code 1 even when the
          // action exists, so check stdout instead of the exit code.
          execFile("pkaction", ["--action-id", "co.zingo.pc.authenticate"], (_err, stdout) => {
            resolve(stdout && stdout.includes("co.zingo.pc.authenticate") ? "available" : "not_installed_linux");
          });
        }),
      "not_installed_linux",
    );
  }
  return "not_supported";
});

ipcMain.handle("auth:verify", async (_e, reason) => {
  // Universal rule: when device authentication is NOT available on the current
  // platform / install (no Touch ID enrolled, Windows Hello not set up, polkit
  // action not registered for AppImage / dev runs, etc.) we silently succeed.
  // Otherwise the user gets a "Send" button that does nothing — surprising and
  // hard to debug. Security-wise we already require an explicit opt-in for the
  // feature: `requireDeviceAuth` defaults to true, but the renderer also gates
  // the LOCK screen on auth:check === "available", so disabling here keeps the
  // two callers consistent.
  if (process.platform === "win32") {
    const win = BrowserWindow.getAllWindows()[0] ?? null;
    try {
      const native = getNative();
      if (native.checkWindowsHello() !== "available") return { success: true };
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
      const native = getNative();
      if (native.checkMacAuth() !== "available") return { success: true };
      return await native.verifyMacUser(String(reason));
    } catch {
      return { success: false };
    }
  } else if (process.platform === "linux") {
    return new Promise((resolve) => {
      const { execFile } = require("child_process");
      // Probe the polkit action first; if it's not registered (dev mode,
      // AppImage, missing .deb post-install) skip verification rather than
      // failing the entire send flow.
      execFile("pkaction", ["--action-id", "co.zingo.pc.authenticate"], (_err, stdout) => {
        const available = stdout && stdout.includes("co.zingo.pc.authenticate");
        if (!available) {
          resolve({ success: true });
          return;
        }
        execFile(
          "pkcheck",
          ["--action-id", "co.zingo.pc.authenticate", "--process", String(process.pid), "--allow-user-interaction"],
          (err) => resolve({ success: !err }),
        );
      });
    });
  }
  return { success: true };
});

// ── Keychain-backed requireDeviceAuth ─────────────────────────────────────
// Missing or deleted entry is treated as true (auth required by default).
// Only an explicit "false" stored by the user disables the feature.
const KEYTAR_SERVICE = "Zingo PC";
const KEYTAR_ACCOUNT = "requireDeviceAuth";

// In-process cache of the value so we only hit Keychain ONCE per session.
// Repeated accesses (loadSettings is called several times across pages) used
// to make macOS prompt for the Keychain password intermittently — especially
// across TestFlight builds whose signature differs slightly run-to-run.
// Updated by setRequireAuth so the cache and Keychain stay in sync.
let _requireAuthCache = null; // null = not loaded yet, true/false = loaded

async function getRequireAuth() {
  if (_requireAuthCache !== null) return _requireAuthCache;
  try {
    const keytar = require("keytar");
    const value = await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
    _requireAuthCache = value === null ? true : value === "true";
  } catch {
    // libsecret unavailable (Linux AppImage, etc.) → fall back to settings.json, default true
    _requireAuthCache = settings.getSync("all.requireDeviceAuth") ?? true;
  }
  return _requireAuthCache;
}

async function setRequireAuth(value) {
  try {
    const keytar = require("keytar");
    await keytar.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT, value ? "true" : "false");
    settings.unsetSync("all.requireDeviceAuth");
  } catch {
    settings.setSync("all.requireDeviceAuth", value);
  }
  _requireAuthCache = value;
}

// shell.openExternal and clipboard.writeText are not available in sandboxed preload —
// route them through IPC so the main process performs the action.
ipcMain.handle("shell:openExternal", (_e, url) => {
  if (typeof url === "string" && url.startsWith("https://")) {
    return shell.openExternal(url);
  }
});

ipcMain.handle("clipboard:writeText", (_e, text) => {
  if (typeof text === "string") {
    clipboard.writeText(text);
  }
});

// Zcash Names Service (ZNS) resolver.
// Lives in the main process for three reasons that all apply on every platform:
//   1. The renderer's CSP `connect-src 'self'` blocks fetch() to external hosts.
//   2. CORS from a file:// origin breaks cross-origin requests.
//   3. MAS / Flatpak sandboxes grant network access at the app level — main is
//      the natural place to consume it.
// The SDK auto-handles endpoint selection and the ZIP-321 protocol details.
// Clients are cached per chain so we don't reconstruct on every keystroke.
const znsClients = new Map();
function getZnsClient(chain) {
  if (znsClients.has(chain)) return znsClients.get(chain);
  const network = chain === "main" ? "mainnet" : chain === "test" ? "testnet" : null;
  if (!network) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ZNS } = require("zcashname-sdk");
  const client = new ZNS({ network });
  znsClients.set(chain, client);
  return client;
}

ipcMain.handle("zns:resolve", async (_e, name, chain) => {
  if (typeof name !== "string" || !/^[a-z0-9]{1,62}$/.test(name)) {
    return { ok: false, reason: "invalid-name" };
  }
  const client = getZnsClient(chain);
  if (!client) return { ok: false, reason: "unsupported-chain" };
  try {
    const reg = await client.resolveName(name);
    if (!reg || typeof reg.address !== "string") return { ok: false, reason: "not-found" };
    return { ok: true, address: reg.address };
  } catch {
    return { ok: false, reason: "network" };
  }
});

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

// Save a PNG via the user-selected save dialog. The renderer used to do this
// with an `<a download>` link, which required `files.downloads.read-write`.
// Apple flagged that entitlement as unused (2.4.5(i)) because we can achieve
// the same UX through the standard save panel — which only needs the
// `files.user-selected.read-write` entitlement we already have.
ipcMain.handle("save-png", async (_e, { dataUrl, suggestedName }) => {
  const mainWindow = BrowserWindow.getAllWindows()[0] ?? null;
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: "Save QR code",
    defaultPath: suggestedName,
    filters: [{ name: "PNG image", extensions: ["png"] }],
  });
  if (canceled || !filePath) return { ok: false, reason: "cancelled" };
  try {
    const base64 = String(dataUrl).replace(/^data:image\/[a-z+-]+;base64,/, "");
    fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
    return { ok: true, filePath };
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
});
ipcMain.handle("wallets:all", async () => getWallets());
ipcMain.handle("wallets:get", async (_e, id) => getWallet(id));
ipcMain.handle("wallets:add", async (_e, wallet) => addWallet(wallet));
ipcMain.handle("wallets:update", async (_e, wallet) => updateWallet(wallet));
ipcMain.handle("wallets:remove", async (_e, id) => removeWallet(id));
ipcMain.handle("wallets:clear", async () => clearWallets());
ipcMain.handle("get-app-data-path", () => app.getPath("appData"));

// Lazy: app.getPath() requires app.ready — IPC handlers only fire after ready so this is safe.
// In MAS the containerized path (~/Library/Containers/co.zingo.pc/...) is resolved at runtime.
let _fsAllowedBases = null;
function getFsAllowedBases() {
  if (!_fsAllowedBases) {
    _fsAllowedBases = [app.getPath("appData"), app.getPath("userData")].map((p) => path.resolve(p) + path.sep);
  }
  return _fsAllowedBases;
}
function assertFsPath(p) {
  const resolved = path.resolve(p) + path.sep;
  if (!getFsAllowedBases().some((base) => resolved.startsWith(base))) {
    throw new Error(`fs access denied: ${p}`);
  }
}
function assertWalletName(name) {
  if (typeof name !== "string" || name.length === 0) return;
  // Reject only what's actually unsafe as a filename across platforms:
  //   - path separators: / \
  //   - Windows-invalid chars: : * ? " < > |
  //   - control chars and DEL: \x00-\x1f \x7f
  // Everything else (spaces, parentheses, accented letters, etc.) is allowed
  // because it's a valid filename character on all major OSes.
  if (/[/\\:*?"<>|\x00-\x1f\x7f]/.test(name)) {
    throw new Error(`wallet_name rejected: invalid characters`);
  }
  // "." and ".." would resolve to current/parent dir — reject those literally.
  if (name === "." || name === "..") {
    throw new Error(`wallet_name rejected: invalid name`);
  }
}

ipcMain.handle("fs:existsSync", (_e, p) => {
  assertFsPath(p);
  return fs.existsSync(p);
});
ipcMain.handle("fs:mkdir", (_e, p, opts) => {
  assertFsPath(p);
  return fs.promises.mkdir(p, opts);
});
ipcMain.handle("fs:writeFile", (_e, p, data) => {
  assertFsPath(p);
  return fs.promises.writeFile(p, data);
});
ipcMain.handle("fs:readFile", (_e, p) => {
  assertFsPath(p);
  return fs.promises.readFile(p, "utf8");
});

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
ipcMain.handle("native:wallet_exists", (_e, server_uri, chain_hint, perf, min_conf, wallet_name) => {
  assertWalletName(wallet_name);
  return getNative().wallet_exists(server_uri, chain_hint, perf, min_conf, wallet_name);
});
ipcMain.handle("native:init_new", (_e, server_uri, chain_hint, perf, min_conf, wallet_name) => {
  assertWalletName(wallet_name);
  return getNative().init_new(server_uri, chain_hint, perf, min_conf, wallet_name);
});
ipcMain.handle("native:init_from_seed", (_e, seed, birthday, server_uri, chain_hint, perf, min_conf, wallet_name) => {
  assertWalletName(wallet_name);
  return getNative().init_from_seed(seed, birthday, server_uri, chain_hint, perf, min_conf, wallet_name);
});
ipcMain.handle("native:init_from_ufvk", (_e, ufvk, birthday, server_uri, chain_hint, perf, min_conf, wallet_name) => {
  assertWalletName(wallet_name);
  return getNative().init_from_ufvk(ufvk, birthday, server_uri, chain_hint, perf, min_conf, wallet_name);
});
ipcMain.handle("native:init_from_b64", (_e, server_uri, chain_hint, perf, min_conf, wallet_name) => {
  assertWalletName(wallet_name);
  return getNative().init_from_b64(server_uri, chain_hint, perf, min_conf, wallet_name);
});
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
ipcMain.handle("native:delete_wallet", (_e, server_uri, chain_hint, perf, min_conf, wallet_name) => {
  assertWalletName(wallet_name);
  return getNative().delete_wallet(server_uri, chain_hint, perf, min_conf, wallet_name);
});
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
      let finalPath = selectedPath;
      let finalBookmark = bookmarks[0];
      if (path.basename(selectedPath) !== "Zcash") {
        // First-launch MAS users don't have a `Zcash` folder yet (the DMG version
        // would auto-create it; in sandbox we can't write there until the user
        // grants a bookmark). Offer to create it inside whatever they picked,
        // using their bookmark as the trusted access root.
        const { response } = await dialog.showMessageBox(mainWindow, {
          type: "question",
          title: "Create the Zcash folder?",
          message: `"${path.basename(selectedPath)}" is not the Zcash folder.`,
          detail:
            `Zingo PC stores its wallets in a folder called "Zcash" — typically inside Application Support, ` +
            `shared with other Zcash apps. ` +
            `You can either create one inside "${path.basename(selectedPath)}" now, or go back and pick a different folder.`,
          buttons: ["Create Zcash folder here", "Pick a different folder"],
          defaultId: 0,
          cancelId: 1,
        });
        if (response !== 0) {
          continue;
        }
        if (finalBookmark) {
          activateBookmarkInMainProcess(finalBookmark, wdLog);
        }
        const newZcashPath = path.join(selectedPath, "Zcash");
        try {
          fs.mkdirSync(newZcashPath, { recursive: true });
        } catch (e) {
          wdLog(`mkdir failed: ${e}`);
          await dialog.showMessageBox(mainWindow, {
            type: "error",
            title: "Could not create the Zcash folder",
            message: `Failed to create "${newZcashPath}".`,
            detail: String(e),
            buttons: ["Retry"],
          });
          continue;
        }
        finalPath = newZcashPath;
      }

      // If the user landed somewhere other than the canonical shared location
      // (e.g. they created a Zcash folder on the Desktop, or have a custom setup),
      // surface that explicitly: other Zcash apps won't share wallets from here,
      // and they may want to go back and pick again.
      if (finalPath !== zcashDir) {
        const { response } = await dialog.showMessageBox(mainWindow, {
          type: "warning",
          title: "Non-standard wallet folder",
          message: "This is not the standard Zcash wallet folder.",
          detail:
            `You selected:\n${finalPath}\n\n` +
            `The standard location used by Zcash apps is:\n${zcashDir}\n\n` +
            `Wallets stored elsewhere won't be shared with other Zcash apps (zecwallet, etc.). ` +
            `You can continue with your choice, or go back and pick a different folder.`,
          buttons: ["Continue with this folder", "Pick a different folder"],
          defaultId: 1,
          cancelId: 1,
        });
        if (response !== 0) {
          continue;
        }
      }

      if (finalBookmark) {
        activateBookmarkInMainProcess(finalBookmark, wdLog);
      }
      settings.setSync("all.walletDirBookmark", finalBookmark);
      settings.setSync("all.walletDirPath", finalPath);
      wdLog(`bookmark stored, path=${finalPath}`);
      return { path: finalPath, bookmark: finalBookmark };
    }
  } catch (e) {
    wdLog(`ERROR: ${e}`);
    console.error("wallet-dir:request handler error:", e);
    return null;
  }
});

// MAS only: let the user re-pick the wallet folder (e.g. they picked the wrong one).
// Stores the new bookmark, then restarts so the wallet is reloaded from the new path.
ipcMain.handle("wallet-dir:change", async () => {
  if (process.platform !== "darwin" || !process.mas) return { ok: false, reason: "not-mas" };

  const mainWindow = BrowserWindow.getAllWindows()[0] ?? null;

  const { response } = await dialog.showMessageBox(mainWindow, {
    type: "warning",
    title: "Change wallet folder",
    message: "Change wallet folder location?",
    detail:
      "Zingo PC will close and reopen with the new wallet folder. " +
      "Make sure your wallets exist in the folder you select.",
    buttons: ["Continue", "Cancel"],
    defaultId: 0,
    cancelId: 1,
  });
  if (response !== 0) return { ok: false, reason: "cancelled" };

  const realHome = path.join("/Users", os.userInfo().username);
  const defaultPath = path.join(realHome, "Library", "Application Support", "Zcash");

  while (true) {
    const { canceled, filePaths, bookmarks } = await dialog.showOpenDialog(mainWindow, {
      title: "Select wallet folder",
      message: 'Select the "Zcash" folder and click "Confirm"',
      buttonLabel: "Confirm",
      defaultPath,
      properties: ["openDirectory", "createDirectory"],
      securityScopedBookmarks: true,
    });

    if (canceled || !filePaths || filePaths.length === 0 || !bookmarks || bookmarks.length === 0) {
      return { ok: false, reason: "cancelled" };
    }

    const selectedPath = filePaths[0];
    let finalPath = selectedPath;
    let finalBookmark = bookmarks[0];
    if (path.basename(selectedPath) !== "Zcash") {
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: "question",
        title: "Create the Zcash folder?",
        message: `"${path.basename(selectedPath)}" is not the Zcash folder.`,
        detail:
          `Zingo PC stores its wallets in a folder called "Zcash". ` +
          `You can either create one inside "${path.basename(selectedPath)}" now, or go back and pick a different folder.`,
        buttons: ["Create Zcash folder here", "Pick a different folder"],
        defaultId: 0,
        cancelId: 1,
      });
      if (response !== 0) {
        continue;
      }
      if (finalBookmark) {
        activateBookmarkInMainProcess(finalBookmark, () => {});
      }
      const newZcashPath = path.join(selectedPath, "Zcash");
      try {
        fs.mkdirSync(newZcashPath, { recursive: true });
      } catch (e) {
        await dialog.showMessageBox(mainWindow, {
          type: "error",
          title: "Could not create the Zcash folder",
          message: `Failed to create "${newZcashPath}".`,
          detail: String(e),
          buttons: ["Retry"],
        });
        continue;
      }
      finalPath = newZcashPath;
    }

    // Same non-canonical safeguard as on first launch: if the user landed
    // outside ~/Library/Application Support/Zcash, ask explicitly before saving.
    if (finalPath !== defaultPath) {
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: "warning",
        title: "Non-standard wallet folder",
        message: "This is not the standard Zcash wallet folder.",
        detail:
          `You selected:\n${finalPath}\n\n` +
          `The standard location used by Zcash apps is:\n${defaultPath}\n\n` +
          `Wallets stored elsewhere won't be shared with other Zcash apps (zecwallet, etc.). ` +
          `You can continue with your choice, or go back and pick a different folder.`,
        buttons: ["Continue with this folder", "Pick a different folder"],
        defaultId: 1,
        cancelId: 1,
      });
      if (response !== 0) {
        continue;
      }
    }

    settings.setSync("all.walletDirBookmark", finalBookmark);
    settings.setSync("all.walletDirPath", finalPath);

    // app.relaunch() is unreliable in MAS sandbox (can leave the container in a
    // broken state that crashes the next launch at _libsecinit_appsandbox).
    // Ask the user to reopen the app manually instead.
    await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Restart required",
      message: "Wallet folder updated.",
      detail: "Zingo PC will now close. Please reopen it to use the new wallet folder.",
      buttons: ["Quit"],
    });
    app.quit();
    return { ok: true };
  }
});

// Import data from another installation: open folder picker and list which of the
// 3 known files (settings.json, wallets.json, AddressBook.json) are present.
ipcMain.handle("import:scan", async () => {
  const isInSandbox = process.mas || !!process.env.FLATPAK_ID;
  if (!isInSandbox) return { ok: false, reason: "not-sandboxed" };

  const mainWindow = BrowserWindow.getAllWindows()[0] ?? null;

  let defaultPath;
  if (process.mas) {
    const realHome = path.join("/Users", os.userInfo().username);
    defaultPath = path.join(realHome, "Library", "Application Support", "Zingo PC");
  } else {
    // Flatpak: the standard Linux Electron userData for .deb / AppImage
    defaultPath = path.join(os.homedir(), ".config", "Zingo PC");
  }

  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: "Select source folder",
    message: "Select the data folder from your previous Zingo PC installation.",
    buttonLabel: "Open",
    defaultPath,
    properties: ["openDirectory"],
  });

  if (canceled || !filePaths || filePaths.length === 0) {
    return { ok: false, reason: "cancelled" };
  }

  const sourceDir = filePaths[0];
  const userData = app.getPath("userData");

  if (path.resolve(sourceDir) === path.resolve(userData)) {
    await dialog.showMessageBox(mainWindow, {
      type: "warning",
      title: "Invalid folder",
      message: "Cannot import from the current installation's own folder.",
      detail: "Please select a different Zingo PC data folder.",
      buttons: ["OK"],
    });
    return { ok: false, reason: "same-folder" };
  }

  // Only count files that are actually importable from the interactive modal.
  // settings.json is migrated only on first-launch (with currentwalletid nulled),
  // not via this flow — so a folder with just settings.json should be treated as
  // having nothing to import.
  const fileNames = ["wallets.json", "AddressBook.json"];
  const present = fileNames.filter((f) => fs.existsSync(resolveDataFile(sourceDir, f)));

  if (present.length === 0) {
    await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Nothing to import",
      message: "No importable data found in this folder.",
      detail:
        "The selected folder doesn't contain a wallets.json or AddressBook.json " +
        "from a previous Zingo PC installation.",
      buttons: ["OK"],
    });
    return { ok: false, reason: "no-data-found", sourceDir };
  }

  // Remember the user-confirmed path so import:apply can verify it wasn't
  // swapped by the renderer. Only set on the success path — a "no-data-found"
  // return does not authorize an apply.
  _lastScanSourceDir = path.resolve(sourceDir);
  return { ok: true, sourceDir, present };
});

// Apply user's per-file choices (replace / merge / skip). Restarts the app on success.
ipcMain.handle("import:apply", async (_e, { sourceDir, choices }) => {
  const isInSandbox = process.mas || !!process.env.FLATPAK_ID;
  if (!isInSandbox) return { ok: false, reason: "not-sandboxed" };

  if (typeof sourceDir !== "string" || !sourceDir) return { ok: false, reason: "bad-source" };
  if (!choices || typeof choices !== "object") return { ok: false, reason: "bad-choices" };

  // sourceDir MUST match what the user selected in import:scan's system dialog.
  // Without this check a compromised renderer could pass an arbitrary directory
  // and have its wallets.json / AddressBook.json / settings.json copied into
  // userData, overwriting the user's data with attacker-supplied content.
  if (_lastScanSourceDir === null || path.resolve(sourceDir) !== _lastScanSourceDir) {
    return { ok: false, reason: "not-scanned" };
  }

  const userData = app.getPath("userData");
  if (path.resolve(sourceDir) === path.resolve(userData)) {
    return { ok: false, reason: "same-folder" };
  }

  const logImp = (msg) => {
    try {
      fs.appendFileSync(path.join(userData, "startup.log"), `${new Date().toISOString()} [import] ${msg}\n`);
    } catch (_) {}
  };

  const results = {};

  const copyResolved = (name) => {
    const dest = resolveDataFile(userData, name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(resolveDataFile(sourceDir, name), dest);
  };

  // settings.json: replace or skip (merging a config object doesn't make sense)
  if (choices.settings === "replace") {
    try {
      copyResolved("settings.json");
      results.settings = "replaced";
    } catch (err) {
      results.settings = `failed: ${err?.message ?? err}`;
    }
  } else {
    results.settings = "skipped";
  }

  // wallets.json: replace, merge (dedupe by fileName, keep existing on duplicate), or skip.
  // electron-json-storage stores a plain array on disk: [WalletType, ...]
  // (older code used a {wallets:[...]} wrapper — handle both for safety).
  const toList = (parsed) => (Array.isArray(parsed) ? parsed : Array.isArray(parsed?.wallets) ? parsed.wallets : []);
  if (choices.wallets === "replace") {
    try {
      copyResolved("wallets.json");
      results.wallets = "replaced";
    } catch (err) {
      results.wallets = `failed: ${err?.message ?? err}`;
    }
  } else if (choices.wallets === "merge") {
    try {
      const srcList = toList(JSON.parse(fs.readFileSync(resolveDataFile(sourceDir, "wallets.json"), "utf8")));

      const destPath = resolveDataFile(userData, "wallets.json");
      const destList = fs.existsSync(destPath) ? toList(JSON.parse(fs.readFileSync(destPath, "utf8"))) : [];

      // Dedup key combines chain_name + fileName: the same fileName in different
      // network subfolders (mainnet/, testnet3/, regtest/) refers to physically
      // distinct .dat files and must NOT be treated as a duplicate.
      const walletKey = (w) => `${w?.chain_name ?? "main"}:${w?.fileName}`;
      const existingKeys = new Set(destList.map(walletKey));
      const nextId = (destList.reduce((max, w) => Math.max(max, w.id ?? 0), 0) || 0) + 1;
      let added = 0;
      let skipped = 0;
      for (const w of srcList) {
        if (!w || !w.fileName) continue;
        const k = walletKey(w);
        if (existingKeys.has(k)) {
          skipped++;
          continue;
        }
        destList.push({ ...w, id: nextId + added });
        existingKeys.add(k);
        added++;
      }

      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      // Write as a plain array — that's the format electron-json-storage reads.
      fs.writeFileSync(destPath, JSON.stringify(destList));
      results.wallets = `merged: ${added} added, ${skipped} duplicates skipped`;
    } catch (err) {
      results.wallets = `failed: ${err?.message ?? err}`;
    }
  } else {
    results.wallets = "skipped";
  }

  // AddressBook.json: replace, merge (dedupe by address, keep existing on duplicate), or skip
  if (choices.addressBook === "replace") {
    try {
      copyResolved("AddressBook.json");
      results.addressBook = "replaced";
    } catch (err) {
      results.addressBook = `failed: ${err?.message ?? err}`;
    }
  } else if (choices.addressBook === "merge") {
    try {
      const src = JSON.parse(fs.readFileSync(resolveDataFile(sourceDir, "AddressBook.json"), "utf8"));
      const srcList = Array.isArray(src) ? src : [];

      const destPath = resolveDataFile(userData, "AddressBook.json");
      const dest = fs.existsSync(destPath) ? JSON.parse(fs.readFileSync(destPath, "utf8")) : [];
      const destList = Array.isArray(dest) ? dest : [];

      const existingAddrs = new Set(destList.map((e) => e?.address));
      let added = 0;
      let skipped = 0;
      for (const e of srcList) {
        if (!e || !e.address) continue;
        if (existingAddrs.has(e.address)) {
          skipped++;
          continue;
        }
        destList.push(e);
        existingAddrs.add(e.address);
        added++;
      }

      fs.writeFileSync(destPath, JSON.stringify(destList));
      results.addressBook = `merged: ${added} added, ${skipped} duplicates skipped`;
    } catch (err) {
      results.addressBook = `failed: ${err?.message ?? err}`;
    }
  } else {
    results.addressBook = "skipped";
  }

  logImp(`from=${sourceDir} ${JSON.stringify(results)}`);

  // app.relaunch() is unreliable in MAS sandbox — ask the user to reopen instead.
  const mainWindow = BrowserWindow.getAllWindows()[0] ?? null;
  await dialog.showMessageBox(mainWindow, {
    type: "info",
    title: "Import complete",
    message: "Data imported.",
    detail: "Zingo PC will now close. Please reopen it to use the imported data.",
    buttons: ["Quit"],
  });
  app.quit();
  return { ok: true, results };
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
  // app.quit() triggers the full Electron teardown, which in Electron 40 crashes
  // the InProc GPU thread during cleanup of the rust_png/fontations subsystem
  // (a known upstream bug). The wallet has already been saved by the renderer
  // before sending appquitdone, so a hard exit here is safe and avoids the
  // user-visible crash dialog.
  app.exit(0);
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
      preload: path.join(__dirname, "preload.js"),
    },
  });

  const ignore = process.platform !== "darwin";
  mainWindow.webContents.setIgnoreMenuShortcuts(ignore);

  // Block new windows — open https:// URLs in the system browser instead.
  // Prevents a compromised renderer from spawning a window that inherits the preload.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });

  // Block navigation away from the app URL.
  // Prevents the renderer from loading an external page inside the Electron window.
  const appOrigin = isDev ? "http://localhost:3000" : "file://";
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(appOrigin)) event.preventDefault();
  });

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

  if (sandboxDisabled) {
    // Log to startup.log if available (log() is only defined in the !isDev block above).
    if (typeof log === "function") log("WARNING: Chromium sandbox disabled (unprivileged_userns_clone=0)");
    mainWindow.webContents.once("did-finish-load", () => {
      dialog.showMessageBox(mainWindow, {
        type: "warning",
        title: "Security Warning",
        message: "Chromium sandbox is disabled",
        detail:
          "Zingo PC is running without the Chromium process sandbox because your system " +
          "has user namespaces disabled (unprivileged_userns_clone=0).\n\n" +
          "This reduces the security isolation of the application. " +
          "For full security, install the .deb package instead of the AppImage — " +
          "it enables the sandbox automatically via the chrome-sandbox SUID helper.",
        buttons: ["OK"],
      });
    });
  }

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

// "in-process-gpu" forced the GPU into the browser process — historically added
// in 2022 to work around an old issue, but in modern Electron + sandbox:true
// renderers it causes:
//   - Windows: blank white/blue windows (GPU paint never initializes)
//   - macOS:   shutdown crash in Chrome_InProcGpuThread (rust_png/fontations)
// Removing it puts Chromium back on its default out-of-process GPU.
// app.commandLine.appendSwitch("in-process-gpu");

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

// Resolves the on-disk path for a known data file.
// wallets.json lives in electron-json-storage's "storage" subdirectory; the rest
// are at the userData root.
function resolveDataFile(rootDir, name) {
  if (name === "wallets.json") return path.join(rootDir, "storage", "wallets.json");
  return path.join(rootDir, name);
}

// One-shot migration from a previous DMG (non-sandboxed) install:
// copies settings.json / wallets.json / AddressBook.json into the MAS container.
// MAS sandbox cannot read the DMG userData silently — the user picks the folder
// via NSOpenPanel (the default path is pre-set so it's effectively one click).
async function maybeRunDmgToMasMigration() {
  if (process.platform !== "darwin" || !process.mas) return;

  const userData = app.getPath("userData");
  const marker = path.join(userData, ".dmg-migration-checked");
  const fileNames = ["settings.json", "wallets.json", "AddressBook.json"];

  if (fs.existsSync(marker)) return;

  // Container already has data: write the marker and skip (handles upgrades from
  // a prior MAS build that pre-dates this migration code).
  if (fileNames.some((f) => fs.existsSync(resolveDataFile(userData, f)))) {
    try {
      fs.writeFileSync(marker, new Date().toISOString());
    } catch (_) {}
    return;
  }

  const markChecked = () => {
    try {
      fs.writeFileSync(marker, new Date().toISOString());
    } catch (_) {}
  };
  const logMig = (msg) => {
    try {
      fs.appendFileSync(path.join(userData, "startup.log"), `${new Date().toISOString()} [migration] ${msg}\n`);
    } catch (_) {}
  };

  const { response: choice } = await dialog.showMessageBox(null, {
    type: "question",
    title: "Migrate from previous installation?",
    message: "Did you previously use Zingo PC?",
    detail:
      "If you used a previous version of Zingo PC (installed from the website's DMG), " +
      "click Migrate to import your wallets, address book, and settings.\n\n" +
      "If this is a fresh install, click Skip.",
    buttons: ["Migrate", "Skip"],
    defaultId: 0,
    cancelId: 1,
  });

  if (choice !== 0) {
    markChecked();
    logMig("user chose skip");
    return;
  }

  const realHome = path.join("/Users", os.userInfo().username);
  const defaultPath = path.join(realHome, "Library", "Application Support", "Zingo PC");

  while (true) {
    const { canceled, filePaths } = await dialog.showOpenDialog(null, {
      title: "Select your previous Zingo PC data folder",
      message: 'Select the "Zingo PC" folder inside ~/Library/Application Support and click "Open".',
      buttonLabel: "Open",
      defaultPath,
      properties: ["openDirectory"],
    });

    if (canceled || !filePaths || filePaths.length === 0) {
      markChecked();
      logMig("user cancelled folder picker");
      return;
    }

    const sourceDir = filePaths[0];

    if (path.resolve(sourceDir) === path.resolve(userData)) {
      await dialog.showMessageBox(null, {
        type: "warning",
        title: "Invalid folder",
        message: "Cannot migrate from the current installation's own folder.",
        detail: "Please select your previous DMG installation's data folder.",
        buttons: ["OK"],
      });
      continue;
    }

    const present = fileNames.filter((f) => fs.existsSync(resolveDataFile(sourceDir, f)));

    if (present.length === 0) {
      const { response: retry } = await dialog.showMessageBox(null, {
        type: "warning",
        title: "No Zingo PC data found",
        message: "Selected folder does not contain Zingo PC data.",
        detail:
          "None of settings.json, wallets.json or AddressBook.json was found. " +
          "Try selecting your previous Zingo PC data folder, or click Skip.",
        buttons: ["Try again", "Skip"],
        defaultId: 0,
        cancelId: 1,
      });
      if (retry !== 0) {
        markChecked();
        logMig("user gave up after empty folder");
        return;
      }
      continue;
    }

    const copied = [];
    const failed = [];
    for (const f of present) {
      try {
        const destPath = resolveDataFile(userData, f);
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        if (f === "settings.json") {
          // currentwalletid from the old install points to a wallet id that may not
          // exist in this install — null it so the app opens the first wallet found.
          const parsed = JSON.parse(fs.readFileSync(resolveDataFile(sourceDir, f), "utf8"));
          if (parsed && parsed.all && "currentwalletid" in parsed.all) {
            parsed.all.currentwalletid = null;
          }
          fs.writeFileSync(destPath, JSON.stringify(parsed));
        } else {
          fs.copyFileSync(resolveDataFile(sourceDir, f), destPath);
        }
        copied.push(f);
      } catch (err) {
        failed.push(`${f} (${err?.message ?? err})`);
      }
    }

    markChecked();
    logMig(`from=${sourceDir} copied=${copied.join(",")} failed=${failed.join(",")}`);

    await dialog.showMessageBox(null, {
      type: copied.length > 0 ? "info" : "error",
      title: "Migration result",
      message: copied.length > 0 ? "Migration complete." : "Migration failed.",
      detail:
        (copied.length > 0 ? `Imported: ${copied.join(", ")}\n` : "") +
        (failed.length > 0 ? `Failed: ${failed.join(", ")}\n` : "") +
        "\nZingo PC will now ask for access to your Zcash wallet folder.",
      buttons: ["OK"],
    });

    return;
  }
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

  // CSP via HTTP headers — takes priority over the meta-tag in index.html.
  // Production is strict (no unsafe-inline). Dev keeps HMR working.
  const CSP_PRODUCTION = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-src 'none'",
  ].join("; ");

  const CSP_DEVELOPMENT = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self' http://localhost:* ws://localhost:*",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-src 'none'",
  ].join("; ");

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [isDev ? CSP_DEVELOPMENT : CSP_PRODUCTION],
      },
    });
  });

  // Deny all renderer permission requests by default. Zingo PC does not use
  // camera, microphone, geolocation, notifications, MIDI, USB, clipboard-read,
  // or any other web-platform permission. Explicit deny-all is defense in depth
  // on top of MAS sandbox entitlements (which already restrict these at the OS
  // level on the App Store build).
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler(() => false);

  await maybeRunDmgToMasMigration();

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
