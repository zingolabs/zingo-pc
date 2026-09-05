// Every native call runs on the libuv thread pool — Neon's `cx.task` puts it
// there — and each one blocks its thread with `RT.block_on` for the whole
// network round trip. The pool is four threads by default.
//
// This app asks for more than four at once. The five-second cycle alone fires
// eleven, and the sync poll, the wallet save and `run_sync` come on top; a
// sync holds its thread for as long as the sync takes. Past four, the rest
// queue, and the wait lands on whatever asked next.
//
// It showed as a wallet that stopped for a minute at a time and then caught
// up in a burst, and as `server health: answered in 110785ms` against a
// server answering the same call in 150ms from another process on the same
// machine at the same moment. Nothing was slow. Everything was waiting.
//
// Raising the pool from here does not work, and the line that used to try was
// removed rather than left looking like a safeguard. libuv reads
// UV_THREADPOOL_SIZE once, when it creates the pool, and that happens during
// Electron's own boot — before this file runs. Measured: sixteen concurrent
// pool calls from an Electron main script that had just assigned "16" still
// completed in four batches of four. Set in the environment before launch it
// works, but an installed .exe has no such environment.
//
// So the fix is on the other side of the boundary, and it is done:
// `spawn_promise` in native/src/lib.rs hands every endpoint to tokio's
// blocking pool instead of libuv's. Nothing here depends on the pool size any
// more.

const {
  app,
  BrowserWindow,
  Menu,
  shell,
  ipcMain,
  dialog,
  session,
  clipboard,
  powerMonitor,
  safeStorage,
} = require("electron");
const os = require("os");
const path = require("path");
const fs = require("fs");
const settings = require("electron-settings");
const storage = require("electron-json-storage");
const { createServerRegistry } = require("./serverRegistry");

const STORAGE_KEY = "wallets";
const isDev = !app.isPackaged;

// Is the main process's event loop the thing that stalls?
//
// The app goes completely silent for ~55s at a time: the sync poll, the wallet
// save and the server health probe stop and resume together, within a couple of
// hundred milliseconds of each other. They share no wallet lock, no server, and
// since the endpoints moved off `cx.task` no thread pool either — eight of them
// measured running genuinely in parallel. Things with nothing in common do not
// stop together by accident; something they all pass through is stalling.
//
// This loop is one such thing. Every native answer settles on it (Neon's
// `Channel` posts the promise's completion to the JS main thread), and every
// IPC reply leaves through it, so if it blocks, every call looks slow at once.
//
// A timer that only speaks when it is late. It is asked to run every second, so
// a longer gap means the loop could not get to it — and the gap is how long the
// loop was blocked. Silence is the healthy reading, and the one that would rule
// the main process out and send the search downstream.
const LOOP_TICK_MS = 1_000;
const LOOP_STALL_REPORT_MS = 2_000;
let lastLoopTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const sinceLastTick = now - lastLoopTick;
  lastLoopTick = now;
  if (sinceLastTick < LOOP_STALL_REPORT_MS) return;

  const line = `[main-loop] blocked for ${sinceLastTick}ms`;
  console.log(line);
  // A packaged app has no terminal, and `startup.log` only collects what the
  // renderer's console emits — so on the build a user actually runs, the line
  // above reaches nobody. That is the one case this probe exists for: a stall
  // reported from a machine we cannot attach to. Written the same way the
  // wallet-dir diagnostics are, path resolved per call and failures swallowed,
  // because a probe that throws is worse than one that says nothing.
  if (isDev) return;
  try {
    require("fs").appendFileSync(
      require("path").join(app.getPath("userData"), "startup.log"),
      `${new Date().toISOString()} ${line}\n`,
    );
  } catch (_) {}
}, LOOP_TICK_MS).unref();

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
        { type: "separator" },
        {
          label: "Financial &Insight",
          accelerator: "Ctrl+I",
          click: () => {
            mainWindow.webContents.send("insight");
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
          label: "&Nym Mixnet",
          accelerator: "Ctrl+N",
          click: () => {
            mainWindow.webContents.send("mixnet-settings");
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
          { type: "separator" },
          {
            label: "Financial &Insight",
            accelerator: "Ctrl+I",
            click: () => {
              mainWindow.webContents.send("insight");
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
            label: "&Nym Mixnet",
            accelerator: "Ctrl+N",
            click: () => {
              mainWindow.webContents.send("mixnet-settings");
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

// Writing the wallet list finishes with a rename: the store writes a temporary
// file and moves it over the real one, so a crash mid-write cannot leave a
// half-written list. On Windows that move fails with EPERM whenever anything
// holds the destination for an instant — Defender reading a file that just
// changed, the search indexer, a folder-syncing client, another copy of the app.
// It clears on its own in tens of milliseconds, and the writer underneath makes
// exactly one attempt (write-file-atomic 2.4.3), so a moment's contention
// surfaced as a hard failure.
//
// The app could not recover from it either: the report that prompted this was a
// user whose server had stopped answering, and whose attempt to pick another one
// died here — the save is what the change of server needed, so being unable to
// save left them unable to fix the thing that was wrong.
//
// Half a second of patience, spent only on the codes that mean "busy right now".
// Anything else is a real fault and raised immediately: a full disk or a
// read-only file will not be fixed by asking again.
const WRITE_RETRY_DELAYS_MS = [30, 80, 150, 250];
const BUSY_CODES = new Set(["EPERM", "EBUSY", "EACCES"]);

async function withWriteRetries(what, attempt) {
  for (let tries = 0; ; tries += 1) {
    try {
      return await attempt();
    } catch (error) {
      const code = error && error.code;
      if (!BUSY_CODES.has(code)) throw error;
      const wait = WRITE_RETRY_DELAYS_MS[tries];
      if (wait === undefined) {
        // Said in the terms the user can act on. The code alone names an
        // operating-system rule, not the thing holding the file.
        throw new Error(
          `${what} could not be saved: Windows would not replace the file (${code}). ` +
            "Something is holding it open — antivirus, a folder-syncing client, or another " +
            "copy of Zingo PC still running. Close any other Zingo PC window and try again.",
        );
      }
      console.log(`[storage] ${what}: ${code}, retrying in ${wait}ms`);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
}

async function clearWallets() {
  return withWriteRetries(
    "The wallet list",
    () =>
      new Promise((resolve, reject) => {
        storage.remove(STORAGE_KEY, (err) => (err ? reject(err) : resolve()));
      }),
  );
}

async function saveWallets(wallets) {
  return withWriteRetries(
    "The wallet list",
    () =>
      new Promise((resolve, reject) => {
        storage.set(STORAGE_KEY, wallets, (err) => (err ? reject(err) : resolve()));
      }),
  );
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

// Race a platform probe against a timeout so a hung native call (e.g. Windows
// Hello on a system where the consent dialog never surfaces) doesn't block the
// renderer forever and leave it on a screen with no way out.
const withAuthTimeout = (probe, fallback = "not_supported", ms = 3000) =>
  Promise.race([
    Promise.resolve().then(() => probe()),
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]).catch(() => fallback);

// Availability probes are non-interactive, so seconds are plenty. Verification
// waits on a person presenting a face, finger or PIN, so it gets a minute — long
// enough not to cut a real user off, short enough to end rather than hang.
const AUTH_PROBE_TIMEOUT_MS = 3000;
const AUTH_VERIFY_TIMEOUT_MS = 60000;

ipcMain.handle("auth:check", async () => {
  const withTimeout = withAuthTimeout;

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
  // Both calls are timed out for the same reason auth:check is: a native probe
  // or prompt that never returns used to strand the caller. The lock screen sat
  // on "Authenticating..." with the window already blurred, and no way forward.
  if (process.platform === "win32") {
    const win = BrowserWindow.getAllWindows()[0] ?? null;
    try {
      const native = getNative();
      const availability = await withAuthTimeout(
        () => native.checkWindowsHello(),
        "not_supported",
        AUTH_PROBE_TIMEOUT_MS,
      );
      if (availability !== "available") return { success: true };
      if (win) win.blur();
      const result = await withAuthTimeout(
        () => native.verifyWindowsUser(String(reason)),
        { success: false },
        AUTH_VERIFY_TIMEOUT_MS,
      );
      if (win) win.focus();
      return result;
    } catch {
      if (win) win.focus();
      return { success: false };
    }
  } else if (process.platform === "darwin") {
    try {
      const native = getNative();
      const availability = await withAuthTimeout(() => native.checkMacAuth(), "not_supported", AUTH_PROBE_TIMEOUT_MS);
      if (availability !== "available") return { success: true };
      return await withAuthTimeout(
        () => native.verifyMacUser(String(reason)),
        { success: false },
        AUTH_VERIFY_TIMEOUT_MS,
      );
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

// Live lightwalletd registry — the transport and cache live in serverRegistry.js
// so they can be tested without Electron; see the reasoning in that file.
const serverRegistry = createServerRegistry({
  store: {
    get: (key) => settings.getSync(key),
    set: (key, value) => settings.setSync(key, value),
  },
});

ipcMain.handle("servers:fetchList", async (_e, chain) => {
  const servers = await serverRegistry.load(chain);
  return servers ? { ok: true, servers } : { ok: false };
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

// The swap layer's HTTP, performed here for the same three reasons the ZNS
// resolver and the server registry are: the renderer's CSP forbids `connect-src`
// to external hosts, CORS blocks a file:// origin in the packaged app, and
// sandboxed builds grant network access at the app level.
//
// The host allowlist is what keeps this from being an open proxy. Without it a
// renderer could ask main to fetch anything, which would undo the CSP rather
// than work within it. Hosts are compared exactly, so a lookalike domain does
// not pass on a prefix.
//
// This `fetch` goes over clearnet while the wallet's indexer traffic rides the
// mixnet, so a swap reaches the provider with none of the cover a send has.
// zingolib ADR 0024 rule 6 ruled on this shape for price-fetch and zingo-pc
// honours it there. Doing the same for swap traffic was deferred rather than
// rejected, with the reasoning and the options in docs/swap-privacy.md. Read
// that before changing how this request travels.
const SWAP_HTTP_HOSTS = new Set(["api.swapkit.dev", "midgard.mayachain.info", "midgard.ninerealms.com"]);
const SWAP_HTTP_MAX_TIMEOUT_MS = 30000;

ipcMain.handle("swapHttp:request", async (_e, request) => {
  const { url, method, headers, body, timeoutMs } = request ?? {};

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`swapHttp: unparseable url`);
  }
  if (parsed.protocol !== "https:" || !SWAP_HTTP_HOSTS.has(parsed.hostname)) {
    throw new Error(`swapHttp: refusing ${parsed.protocol}//${parsed.hostname}`);
  }

  // The renderer aborts with an AbortController it cannot send across IPC, so
  // the deadline is applied here instead. Capped so a caller cannot pin a
  // socket open indefinitely.
  const controller = new AbortController();
  const deadline = Math.min(Number(timeoutMs) || SWAP_HTTP_MAX_TIMEOUT_MS, SWAP_HTTP_MAX_TIMEOUT_MS);
  const timer = setTimeout(() => controller.abort(), deadline);
  try {
    const response = await fetch(url, {
      method: method === "POST" ? "POST" : "GET",
      signal: controller.signal,
      headers: headers ?? {},
      ...(body !== undefined && body !== null && { body }),
    });
    const text = await response.text();
    if (response.ok) rememberLogoHosts(parsed, text);
    return { ok: response.ok, status: response.status, text };
  } finally {
    clearTimeout(timer);
  }
});

// Hosts SwapKit named as logo sources in its own catalog, which is the only
// authority on them: `logoURI` arrives inside the `/tokens` response, so an
// allowlist written here would be a guess that breaks when the CDN moves.
// Harvesting the answer as it passes through gives `swapLogo:get` a list that
// maintains itself and that the renderer cannot widen.
const swapLogoHosts = new Set();

// Read with a pattern rather than JSON.parse: the shape of a catalog entry has
// drifted across SwapKit revisions often enough that the executors carry
// fallback chains for it, while the field name has not moved. This also skips
// a second parse of a megabyte the renderer is about to parse anyway.
const LOGO_URI_PATTERN = /"logoURI"\s*:\s*"(https:\/\/[^"]+)"/g;

function rememberLogoHosts(parsedUrl, text) {
  if (!parsedUrl.pathname.startsWith("/tokens")) return;
  for (const [, logoUrl] of text.matchAll(LOGO_URI_PATTERN)) {
    try {
      swapLogoHosts.add(new URL(logoUrl).hostname);
    } catch {
      // A malformed entry names no host to allow. The token still lists; its
      // logo falls back to the letter avatar.
    }
  }
}

// Swap records persist encrypted at rest, matching what the mobile wallet gets
// from react-native-encrypted-storage: safeStorage derives its key from the OS
// keychain (DPAPI on Windows, Keychain on macOS, libsecret on Linux), so the
// file is unreadable outside the user's session. One file per key, so a corrupt
// entry cannot take the others down with it.
//
// Keys arrive from the renderer and become filenames, so anything outside the
// namespace SwapStore builds is refused rather than sanitized: a rewritten key
// would silently read and write the wrong bucket.
//
// The keys are colon-separated (`swap:records:<wallet fingerprint>`), and a
// colon cannot appear in a Windows filename, so it is percent-encoded on the
// way to disk. `%` is absent from the key alphabet, which keeps that mapping
// reversible: no two distinct keys can encode to the same filename.
const SWAP_KEY_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/;

function swapStoragePath(key) {
  // A key of only dots would encode to `.` or `..`, which name directories
  // rather than files.
  if (typeof key !== "string" || !SWAP_KEY_PATTERN.test(key) || /^\.+$/.test(key)) {
    throw new Error(`swapStorage: refusing key ${JSON.stringify(key)}`);
  }
  const fileName = `${key.replace(/:/g, "%3A")}.bin`;
  return path.join(app.getPath("userData"), "swap-storage", fileName);
}

function assertSwapEncryption() {
  if (!safeStorage.isEncryptionAvailable()) {
    // Writing plaintext instead would be a silent downgrade of the guarantee
    // the mobile wallet makes, so the store fails loudly and its callers
    // surface the failure.
    throw new Error("swapStorage: OS encryption is unavailable");
  }
}

ipcMain.handle("swapStorage:get", async (_e, key) => {
  const file = swapStoragePath(key);
  let ciphertext;
  try {
    ciphertext = await fs.promises.readFile(file);
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
  assertSwapEncryption();
  return safeStorage.decryptString(ciphertext);
});

ipcMain.handle("swapStorage:set", async (_e, key, value) => {
  const file = swapStoragePath(key);
  assertSwapEncryption();
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, safeStorage.encryptString(String(value)));
});

// Token logos, fetched here and handed back as data URIs.
//
// The renderer cannot load them directly: `img-src` allows 'self' and data:
// only. Widening it is not an option either, because the host is not ours to
// know — `logoURI` arrives inside SwapKit's catalog response, so any allowlist
// would be a guess that breaks silently when the CDN moves.
//
// Allowlisted the same way `swapHttp:request` is, from a list SwapKit writes
// rather than one hardcoded here: `rememberLogoHosts` collects the hosts named
// in the catalog as it passes through, and nothing else is fetched. The
// response is constrained on top of that, by an image content-type and a size
// cap, and a data URI rendered into an `<img>` executes nothing.
//
// What remains is recorded in docs/swap-privacy.md: the picker renders up to 60
// logos at a time, so opening it tells whichever CDNs the catalog names which
// tokens the user is looking at, over clearnet like the rest of the swap layer.
const SWAP_LOGO_MAX_BYTES = 256 * 1024;
const SWAP_LOGO_TIMEOUT_MS = 8000;

// Ceiling on everything the cache holds at once. A catalog runs to about a
// thousand tokens, so caching all of them at the per-logo maximum would reach
// hundreds of megabytes for pictures the size of a favicon. Sized to hold a
// realistic session's worth and evict rather than grow: a miss costs one
// refetch, which is what the cache was already doing before this entry existed.
const SWAP_LOGO_CACHE_MAX_BYTES = 16 * 1024 * 1024;

// Insertion-ordered, so the first key is the oldest and eviction reads off the
// front. Values are the data URI, or null for a logo that would not load.
const swapLogoCache = new Map();
let swapLogoCacheBytes = 0;

function cacheLogo(url, dataUri) {
  swapLogoCache.set(url, dataUri);
  swapLogoCacheBytes += dataUri === null ? 0 : dataUri.length;
  while (swapLogoCacheBytes > SWAP_LOGO_CACHE_MAX_BYTES) {
    const oldest = swapLogoCache.keys().next();
    if (oldest.done) break;
    const evicted = swapLogoCache.get(oldest.value);
    swapLogoCache.delete(oldest.value);
    swapLogoCacheBytes -= evicted === null ? 0 : evicted.length;
  }
}

ipcMain.handle("swapLogo:get", async (_e, url) => {
  if (swapLogoCache.has(url)) return swapLogoCache.get(url);

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  // Only hosts SwapKit's own catalog named as logo sources. Before the catalog
  // has been through `swapHttp:request` the set is empty and every logo falls
  // back to its letter avatar, which is the right way round: a token is only
  // ever drawn from a catalog entry, so a URL arriving before one is a URL the
  // catalog did not supply.
  if (parsed.protocol !== "https:" || !swapLogoHosts.has(parsed.hostname)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SWAP_LOGO_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.startsWith("image/")) {
      // SwapKit's CDN lists logos that 404. Remembering the refusal keeps the
      // picker from asking again every time it renders that token.
      cacheLogo(url, null);
      return null;
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > SWAP_LOGO_MAX_BYTES) {
      cacheLogo(url, null);
      return null;
    }

    const dataUri = `data:${contentType.split(";")[0]};base64,${bytes.toString("base64")}`;
    cacheLogo(url, dataUri);
    return dataUri;
  } catch {
    // A logo that will not load is a missing picture, never an error worth
    // interrupting a swap for. The caller draws its fallback. Not remembered:
    // a timeout or a dropped connection says nothing about the URL.
    return null;
  } finally {
    clearTimeout(timer);
  }
});

ipcMain.handle("swapStorage:remove", async (_e, key) => {
  try {
    await fs.promises.unlink(swapStoragePath(key));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
});

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
// Why the load error is kept instead of discarded: when native.node fails to
// load, every caller below fails separately — a wrong-architecture module gave
// four different "cannot read properties of null" further up, none of them
// naming the real cause, and the app looked frozen rather than broken. Windows
// says exactly what is wrong ("%1 is not a valid Win32 application" for an
// arch mismatch); this keeps that sentence and puts it in front of the user.
let _mainNativeError = null;
function getNative() {
  if (!_mainNative && !_mainNativeError) {
    try {
      _mainNative = require(_nativePath);
    } catch (e) {
      _mainNativeError = e;
      console.error(`FATAL: native module failed to load from ${_nativePath}: ${e && e.message}`);
    }
  }
  return _mainNative;
}

// Throws the load failure rather than letting callers trip over a null.
function requireNative(method) {
  const native = getNative();
  if (native && typeof native[method] === "function") {
    return native;
  }
  if (_mainNativeError) {
    throw new Error(`native module failed to load (${_nativePath}): ${_mainNativeError.message}`);
  }
  throw new Error(`native.${method} not available`);
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

// Sets the wallet base directory in the native (Rust) side directly from main.
// Done here instead of letting the renderer call set_wallet_base_dir over IPC so
// a compromised renderer cannot redirect wallet storage to an arbitrary path.
function setWalletBaseDirInMainProcess(walletPath, wdLog) {
  const native = getNative();
  if (native && typeof native.set_wallet_base_dir === "function") {
    const ok = native.set_wallet_base_dir(walletPath);
    wdLog(`main-process set_wallet_base_dir=${ok}`);
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
  "get_unified_addresses",
  "get_transparent_addresses",
  "create_new_transparent_address",
  "derive_refund_address",
  "reserve_refund_address",
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
  // private Ironwood migration (parts/buckets engine), all no-param
  "plan_ironwood_migration",
  "continue_note_splitting",
  "migration_status",
  "reconcile_migration",
  "broadcast_due_parts",
  "auto_broadcast_if_due",
  "catch_up_migration",
  "migrate_to_ironwood",
  "cancel_ironwood_migration",
  "execute_due_parts_status",
];

for (const method of _NATIVE_NO_PARAM_METHODS) {
  ipcMain.handle(`native:${method}`, () => requireNative(method)[method]());
}

// Sync no-param methods (also routed to main — become async over IPC)
for (const method of [
  "deinitialize",
  "get_developer_donation_address",
  "get_zennies_for_zingo_donation_address",
  "set_crypto_default_provider_to_ring",
]) {
  ipcMain.handle(`native:${method}`, () => requireNative(method)[method]());
}

// Methods with parameters
ipcMain.handle("native:wallet_exists", (_e, server_uri, chain_hint, perf, min_conf, wallet_name) => {
  assertWalletName(wallet_name);
  return requireNative("wallet_exists").wallet_exists(server_uri, chain_hint, perf, min_conf, wallet_name);
});
ipcMain.handle("native:init_new", (_e, server_uri, chain_hint, perf, min_conf, wallet_name) => {
  assertWalletName(wallet_name);
  return requireNative("init_new").init_new(server_uri, chain_hint, perf, min_conf, wallet_name);
});
ipcMain.handle("native:init_from_seed", (_e, seed, birthday, server_uri, chain_hint, perf, min_conf, wallet_name) => {
  assertWalletName(wallet_name);
  return requireNative("init_from_seed").init_from_seed(
    seed,
    birthday,
    server_uri,
    chain_hint,
    perf,
    min_conf,
    wallet_name,
  );
});
ipcMain.handle("native:init_from_ufvk", (_e, ufvk, birthday, server_uri, chain_hint, perf, min_conf, wallet_name) => {
  assertWalletName(wallet_name);
  return requireNative("init_from_ufvk").init_from_ufvk(
    ufvk,
    birthday,
    server_uri,
    chain_hint,
    perf,
    min_conf,
    wallet_name,
  );
});
ipcMain.handle("native:init_from_b64", (_e, server_uri, chain_hint, perf, min_conf, wallet_name) => {
  assertWalletName(wallet_name);
  return requireNative("init_from_b64").init_from_b64(server_uri, chain_hint, perf, min_conf, wallet_name);
});
ipcMain.handle("native:get_latest_block_server", (_e, server_uri) =>
  requireNative("get_latest_block_server").get_latest_block_server(server_uri),
);
ipcMain.handle("native:parse_address", (_e, address) => requireNative("parse_address").parse_address(address));
ipcMain.handle("native:parse_ufvk", (_e, ufvk) => requireNative("parse_ufvk").parse_ufvk(ufvk));
ipcMain.handle("native:get_messages", (_e, address) => requireNative("get_messages").get_messages(address));
ipcMain.handle("native:zec_price_over_mixnet", () => requireNative("zec_price_over_mixnet").zec_price_over_mixnet());
// --- Mixnet transport: main-owned, session-level (ADR 0024) ----------------
// Main spawns and holds the nym-proxy for the whole app session. Switching
// wallets re-attaches the new LightClient to the same tunnel instead of
// re-bootstrapping, and the enable/disable intent lives here so a switch
// respects a per-session opt-out. Main is the single source of the Mixnet Mode
// status: it emits an RPCMixnetStatusType-shaped snapshot the renderer projects
// exactly like the wallet-core status it replaced.
const { spawn: spawnChild } = require("child_process");

// The bundled nym-proxy path (only main knows the packaged layout).
//
// Packaged: electron-builder stages it into process.resourcesPath
// (extraResources).
//
// Dev: `yarn mixnet` stages the same binary into the repo's resources/, which
// is where electron-builder picks it up from, so dev and packaged read the one
// artifact. ZINGO_NYM_PROXY still wins, for pointing a dev run at some other
// build. With neither, the bare name falls through to PATH as before.
function nymProxyPath() {
  const exe = process.platform === "win32" ? "nym-proxy.exe" : "nym-proxy";
  if (isDev) {
    if (process.env.ZINGO_NYM_PROXY) return process.env.ZINGO_NYM_PROXY;
    const staged = path.join(__dirname, "..", "resources", exe);
    return fs.existsSync(staged) ? staged : "nym-proxy";
  }
  return path.join(process.resourcesPath, exe);
}

const mixnet = {
  intent: "on", // ForcedOn by default (ADR 0024); flipped by the Settings toggle
  child: null,
  socks5Addr: null,
  // Exit Node identities the proxy announced on NYM_EXIT= lines, which precede
  // the address line. The attach reports them: zingolib treats Ready as an
  // address AND a bound exit, and refuses an empty report.
  exits: [],
  narration: null,
  phase: "unattached", // unattached | bootstrapping | ready | switched_off | died
  // The wallet's own published Mixnet Mode, refreshed on the renderer's poll.
  // Held rather than folded into `phase`, because `phase` is what this side
  // knows about a child process and that stays true on its own terms; this is
  // what the wallet knows about having a route through it. Null until read.
  wallet: null,
};

// A running proxy is not a route. The proxy announcing its address is all
// `phase: "ready"` has ever meant, and the wallet can be nowhere near able to
// use it: not yet attached, attached but still proving the tunnel, or having
// given up on it. Reporting the proxy's readiness as the wallet's was the
// mirage — green while every mixnet-only surface refused, and a price that
// never came with nothing on screen to explain it.
//
// So while the proxy is up the wallet's answer is the one that ships. Its two
// unusable-yet states both read as connecting rather than ready, and its
// narration comes with them when it has one.
function readyStateOfRecord() {
  const wallet = mixnet.wallet;
  // The proxy's own phase says its listener is up. That is not readiness, and
  // the wallet is the only one who can say otherwise: `attach_readiness` exists
  // precisely because a listener accepting TCP proves nothing about the mixnet
  // carrying data.
  //
  // So an unheard wallet reports `bootstrapping`, not `ready`. It used to
  // report ready, and every launch showed a green indicator for the moment
  // between the proxy coming up and the wallet being open enough to answer
  // `mixnet_status` — which then turned yellow and spent the next minute
  // actually building the tunnel. Green, then yellow, then green teaches the
  // user that the first green means nothing.
  //
  // Not cosmetic either: `ready` is one of the two modes that leave sends
  // unblocked, so the false green was also opening the send screen on a
  // transport nobody had confirmed. The wallet core refuses such a send on the
  // route, but the UI is supposed to be fail-closed on its own.
  //
  // `bootstrapping` rather than `unattached` because it is what is happening —
  // the proxy is up and the tunnel is being built — and because `unattached`
  // paints a red "Mixnet unavailable" over an ordinary launch.
  if (!wallet) return { mode: "bootstrapping" };
  switch (wallet.mode) {
    case "died":
      return { mode: "died", death: wallet.death || { at: Date.now() } };
    case "unattached":
    case "bootstrapping":
      return wallet.bootstrap_detail
        ? { mode: "bootstrapping", bootstrap_detail: wallet.bootstrap_detail }
        : { mode: "bootstrapping" };
    default:
      return { mode: "ready", socks5_addr: mixnet.socks5Addr };
  }
}

function mixnetStatusSnapshot() {
  switch (mixnet.phase) {
    case "ready":
      return readyStateOfRecord();
    case "bootstrapping":
      return mixnet.narration
        ? { mode: "bootstrapping", bootstrap_detail: mixnet.narration }
        : { mode: "bootstrapping" };
    case "switched_off":
      return { mode: "switched_off" };
    case "died":
      return { mode: "died", death: { at: Date.now() } };
    default:
      return { mode: "unattached" };
  }
}

function emitMixnetStatus() {
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) win.webContents.send("mixnet-status", mixnetStatusSnapshot());
}

// ── Recovering a lost transport ───────────────────────────────────────────
//
// The policy is zingo-mobile's `MixnetCoordinator`, kept deliberately close to
// it so one Mixnet Mode does not mean two things across the two apps.
//
// What it says: a transport that reports `died` is lost and recovers on its
// own, exponentially backed off from 3s to a 60s ceiling, indefinitely. Only a
// deliberate switch-off stops the loop, because absence of a transport is
// never consent to clearnet — the user chooses that or nothing does. Reaching
// a settled state resets the growth: ready, or the switched-off the user
// asked for.
//
// Two differences from the version this replaces, both learned from mobile.
// It triggers on the status polled rather than on the child process exiting —
// the case in front of us is a proxy that is alive, accepts connections and
// carries nothing, and no exit ever fires for it. And it does not give up
// after a fixed number of tries: a wallet left open for a day through a bad
// hour should come back, and one that never does costs a subprocess every
// minute, which is cheaper than never recovering.
const MIXNET_RECONNECT_BASE_MS = 3_000;
const MIXNET_RECONNECT_MAX_MS = 60_000;
let mixnetReconnectDelay = MIXNET_RECONNECT_BASE_MS;
let mixnetReconnectTimer = null;

function clearMixnetReconnectTimer() {
  if (mixnetReconnectTimer !== null) {
    clearTimeout(mixnetReconnectTimer);
    mixnetReconnectTimer = null;
  }
}

// Timer and growth both, for a transport that settled or that the user took
// down deliberately.
function cancelMixnetReconnect() {
  clearMixnetReconnectTimer();
  mixnetReconnectDelay = MIXNET_RECONNECT_BASE_MS;
}

function scheduleMixnetReconnect(reason) {
  if (mixnet.intent !== "on") return; // deliberately off: leave it off
  if (mixnetReconnectTimer !== null) return; // one already in flight
  const wait = mixnetReconnectDelay;
  console.log(`[mixnet] transport lost (${reason}); reconnecting in ${wait / 1000}s`);
  mixnetReconnectTimer = setTimeout(() => {
    mixnetReconnectTimer = null;
    // Grown before the attempt, not after it. Reaching ready is what resets
    // the growth, so an attempt that works never pays for the doubling.
    mixnetReconnectDelay = Math.min(mixnetReconnectDelay * 2, MIXNET_RECONNECT_MAX_MS);
    if (mixnet.intent !== "on") return;
    // A proxy still running has not exited, it has stopped carrying. Taking it
    // down and bringing a new one up is the only thing that replaces its
    // gateways; spawning is for the case where it really is gone.
    if (mixnet.child) restartMixnet("the transport was lost");
    else spawnProxy();
  }, wait);
}

function setMixnetPhase(phase) {
  mixnet.phase = phase;
  emitMixnetStatus();
}

// Attach whichever LightClient is current to the running tunnel.
async function attachCurrentWallet() {
  if (!mixnet.socks5Addr || mixnet.exits.length === 0) return;
  try {
    await requireNative("attach_mixnet").attach_mixnet(mixnet.socks5Addr, mixnet.exits);
    setMixnetPhase("ready");
  } catch (e) {
    console.error("[mixnet] attach failed:", e && e.message ? e.message : e);
  }
}

function spawnProxy() {
  if (mixnet.child) return;
  mixnet.narration = null;
  setMixnetPhase("bootstrapping");
  const child = spawnChild(nymProxyPath(), [], { stdio: ["pipe", "pipe", "pipe"] });
  mixnet.child = child;

  let buf = "";
  child.stdout.on("data", (chunk) => {
    buf += chunk.toString();
    let nl;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line.startsWith("NYM_EXIT=")) {
        const exit = line.slice("NYM_EXIT=".length).trim();
        if (exit && !mixnet.exits.includes(exit)) mixnet.exits.push(exit);
      } else if (line.startsWith("SOCKS5_ADDR=")) {
        mixnet.socks5Addr = line.slice("SOCKS5_ADDR=".length).trim();
        attachCurrentWallet();
      } else if (line.startsWith("NYM_STATUS=")) {
        mixnet.narration = line.slice("NYM_STATUS=".length).trim();
        if (mixnet.phase === "bootstrapping") emitMixnetStatus();
      }
    }
  });
  child.stderr.on("data", (c) => console.error(`[mixnet] ${c.toString().trim()}`));
  child.on("error", (e) => {
    // Spawn itself failed (binary missing, not executable): no exit event
    // follows, so surface it here instead of hanging on "bootstrapping".
    console.error("[mixnet] spawn error:", e && e.message ? e.message : e);
    if (mixnet.child === child) {
      mixnet.child = null;
      mixnet.socks5Addr = null;
      mixnet.exits = [];
      setMixnetPhase("unattached");
    }
  });
  child.on("exit", () => {
    const deliberate = mixnet.child !== child; // we null it out before killing
    if (deliberate) return;
    mixnet.child = null;
    mixnet.socks5Addr = null;
    mixnet.exits = [];
    if (mixnet.intent === "on") {
      setMixnetPhase("died");
      scheduleMixnetReconnect("the proxy exited");
    }
  });
}

function killProxy() {
  // Whoever is killing it decides what happens next; a reconnect scheduled by
  // an earlier loss would otherwise respawn behind them. The timer only —
  // a restart is an attempt like any other and keeps the backoff it inherited,
  // exactly as mobile's start does.
  clearMixnetReconnectTimer();
  const child = mixnet.child;
  mixnet.child = null;
  mixnet.socks5Addr = null;
  mixnet.exits = [];
  // The wallet's verdict was about the transport being torn down, not the one
  // that replaces it; carrying it over would report the new proxy dead on
  // arrival.
  mixnet.wallet = null;
  if (child) {
    try {
      child.stdin.end(); // the proxy's stdin-EOF watchdog tears it down
    } catch {}
    try {
      child.kill();
    } catch {}
  }
}

// Refreshed on the renderer's existing five-second poll rather than on a timer
// of its own, and only while the proxy is up, which is the only time the answer
// is consulted.
//
// Kept as the wallet's current answer rather than recorded as a verdict here.
// Writing a death into `phase` made it a one-way door: the next poll saw a
// phase that was no longer ready, skipped the read that would have noticed the
// recovery, and left the indicator red until someone pressed a button.
// A death arrives with a typed cause — the stage it failed at, what it was
// reaching for, and the cause chain outermost-first — and nothing was reading
// it. "The connection never establishes" is not something to guess at when the
// transport says why. Once per distinct death, on the same reasoning as the
// price failure: this is on a five-second poll.
let lastReportedDeath = "";

function reportWalletDeath(wallet) {
  if (!wallet || wallet.mode !== "died") {
    lastReportedDeath = "";
    return;
  }
  const detail = wallet.death && wallet.death.detail;
  const story = detail
    ? `${JSON.stringify(detail.stage)} against ${detail.target}: ${(detail.cause_chain || []).join(" ← ")}`
    : "no cause held";
  if (story === lastReportedDeath) return;
  lastReportedDeath = story;
  console.log(`[mixnet] the wallet gave up on the transport — ${story}`);
}

async function refreshWalletMixnetStatus() {
  try {
    mixnet.wallet = JSON.parse(await requireNative("mixnet_status").mixnet_status());
    reportWalletDeath(mixnet.wallet);
  } catch {
    // No wallet loaded yet, or the read itself failed. Neither is evidence
    // about the transport, so the proxy's own phase stands.
    mixnet.wallet = null;
  }
}

ipcMain.handle("mixnet:get-status", async () => {
  if (mixnet.phase === "ready") await refreshWalletMixnetStatus();
  const snapshot = mixnetStatusSnapshot();
  // Mobile's rule, on the status rather than the process: a settled transport
  // ends the cycle and resets the growth, a lost one starts or continues it,
  // and bootstrapping is left alone so an attempt on its way up is not counted
  // as another loss.
  if (snapshot.mode === "ready" || snapshot.mode === "switched_off") cancelMixnetReconnect();
  else if (snapshot.mode === "died") scheduleMixnetReconnect("the wallet gave up on the transport");
  return snapshot;
});
ipcMain.handle("mixnet:enable", async () => {
  mixnet.intent = "on";
  // Attaching again to a transport the wallet has given up on is the same
  // proxy and the same broken tunnel: it returned instantly, went green, and
  // changed nothing, which is exactly how it looked. A death takes the proxy
  // down and brings a new one up — the restart the refusal text promises.
  if (mixnetStatusSnapshot().mode === "died") restartMixnet("the wallet gave up on the transport");
  else if (mixnet.socks5Addr) await attachCurrentWallet();
  else spawnProxy();
  return mixnetStatusSnapshot();
});
ipcMain.handle("mixnet:disable", async () => {
  mixnet.intent = "off";
  cancelMixnetReconnect();
  killProxy();
  try {
    await requireNative("stop_mixnet").stop_mixnet();
  } catch (e) {
    console.error("[mixnet] stop failed:", e && e.message ? e.message : e);
  }
  setMixnetPhase("switched_off");
  return mixnetStatusSnapshot();
});
// Called by the renderer on every wallet load: bring the new client onto the
// session tunnel (or record the opt-out) without re-bootstrapping.
ipcMain.handle("mixnet:attach-current", async () => {
  if (mixnet.intent === "off") {
    try {
      await requireNative("stop_mixnet").stop_mixnet();
    } catch {}
    setMixnetPhase("switched_off");
  } else if (mixnet.socks5Addr) {
    await attachCurrentWallet();
  } else {
    spawnProxy();
  }
  return mixnetStatusSnapshot();
});

// ── Recovering the tunnel after the machine sleeps ────────────────────────
//
// mixnet.phase is a stored value, not a measurement: it moves on lifecycle
// events (spawn, socks5 detected, child exit, the Settings toggle) and nothing
// else. When the machine suspends, nym-proxy survives as a process — so nobody
// declares it dead — while its gateway connections do not. The phase stays
// "ready" indefinitely, zec_price_over_mixnet fails every 5s into a catch that
// deliberately stays quiet, and the indicator reports a tunnel that is gone.
//
// Switching wallets does not help: attach-current re-attaches to the same dead
// socks5 address and asserts "ready" again. What does work is the Settings
// toggle, because disable/enable kills the child and spawns a fresh one. This
// runs that same sequence without making the user find the switch.
const MIXNET_STALE_AFTER_MS = 5 * 60 * 1000;
let mixnetBlurredAt = null;

function restartMixnet(reason) {
  if (mixnet.intent !== "on") return; // deliberately off: leave it off
  console.log(`[mixnet] restarting after ${reason}`);
  killProxy();
  // Detach the native side from the address that is about to disappear. Failure
  // is not interesting — a client that was never attached throws here — and must
  // not stop the respawn.
  Promise.resolve()
    .then(() => requireNative("stop_mixnet").stop_mixnet())
    .catch(() => {})
    .finally(() => {
      if (mixnet.intent === "on") spawnProxy();
    });
}

app.whenReady().then(() => {
  // Waking and unlocking are the two moments a laptop's tunnel is known to be
  // suspect. Not every OS emits both, so both are handled.
  powerMonitor.on("resume", () => restartMixnet("system resume"));
  powerMonitor.on("unlock-screen", () => restartMixnet("screen unlock"));
});

// Focus is the backstop for the cases the OS does not report: a machine that
// idled without ever suspending, or a suspend event that never arrived. Time
// away is the trigger rather than any health signal — after a few minutes
// unattended the cost of a re-bootstrap is lower than the cost of a wallet
// showing stale prices with a green indicator. Below the threshold nothing
// happens, so alt-tabbing does not churn the tunnel.
app.on("browser-window-blur", () => {
  mixnetBlurredAt = Date.now();
});
app.on("browser-window-focus", () => {
  if (mixnetBlurredAt === null) return;
  const away = Date.now() - mixnetBlurredAt;
  mixnetBlurredAt = null;
  if (away >= MIXNET_STALE_AFTER_MS) {
    restartMixnet(`${Math.round(away / 60000)} min unfocused`);
  }
});

app.on("before-quit", () => killProxy());
ipcMain.handle("native:remove_transaction", (_e, txid) => requireNative("remove_transaction").remove_transaction(txid));
ipcMain.handle("native:get_spendable_balance_with_address", (_e, address, zennies) =>
  requireNative("get_spendable_balance_with_address").get_spendable_balance_with_address(address, zennies),
);
ipcMain.handle("native:create_new_unified_address", (_e, receivers) =>
  requireNative("create_new_unified_address").create_new_unified_address(receivers),
);
ipcMain.handle("native:set_config_wallet_to_prod", (_e, perf, min_conf) =>
  requireNative("set_config_wallet_to_prod").set_config_wallet_to_prod(perf, min_conf),
);
ipcMain.handle("native:send", (_e, send_json) => requireNative("send").send(send_json));
ipcMain.handle("native:delete_wallet", (_e, server_uri, chain_hint, perf, min_conf, wallet_name) => {
  assertWalletName(wallet_name);
  return requireNative("delete_wallet").delete_wallet(server_uri, chain_hint, perf, min_conf, wallet_name);
});
ipcMain.handle("native:change_server", (_e, server_uri) => requireNative("change_server").change_server(server_uri));
ipcMain.handle("native:start_ironwood_migration", (_e, consented_plan_hash, per_bucket) =>
  requireNative("start_ironwood_migration").start_ironwood_migration(consented_plan_hash, per_bucket),
);
ipcMain.handle("native:reschedule_parts", (_e, per_bucket) =>
  requireNative("reschedule_parts").reschedule_parts(per_bucket),
);
ipcMain.handle("native:execute_due_parts", (_e, spacing_ms) =>
  requireNative("execute_due_parts").execute_due_parts(spacing_ms),
);

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
      const storedPath = String(settings.getSync("all.walletDirPath") ?? "");
      setWalletBaseDirInMainProcess(storedPath, wdLog);
      return { path: storedPath };
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
      setWalletBaseDirInMainProcess(finalPath, wdLog);
      wdLog(`bookmark stored, path=${finalPath}`);
      return { path: finalPath };
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
      // A minimized wallet has to keep syncing, and by default Chromium will
      // not let it. Once the window is out of sight it throttles the page's
      // timers, and the renderer's five-second work cycle — the sync poll, the
      // wallet save, the server health probe, all of it — drops to one wake-up
      // per minute.
      //
      // Measured, not inferred. A run left minimized reported eight stalls of
      // 59993, 60000, 59999, 59997, 60001, 60000, 59997ms: exactly a minute
      // each, to the millisecond, which is a scheduler's quantum and not
      // anything blocking. Over the same nine minutes the main process's own
      // loop probe never once fired, so nothing was stuck — the renderer was
      // simply not being run.
      //
      // It is the same symptom as a wallet that stops for a minute at a time
      // and then catches up in a burst, which is what sent us looking at thread
      // pools and lock contention. Those were real and are fixed; this was the
      // rest of it, and no amount of work on the native side would have touched
      // it, because nothing was slow. The renderer was asleep.
      backgroundThrottling: false,
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
    // Use app.exit(0) for the same reason as the appquitdone path — app.quit()
    // triggers the full Electron teardown which is slow and can crash the
    // InProc GPU cleanup on Electron 40. A 3s save_wallet_file is already
    // longer than what the user is comfortable waiting for at shutdown.
    setTimeout(() => {
      waitingForClose = false;
      proceedToClose = true;
      console.log("Timeout, quitting");
      app.exit(0);
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

// One-shot migration for a Flatpak install that follows a previous
// deb/AppImage (non-sandboxed) install. Flatpak redirects userData into its
// per-app sandbox (~/.var/app/co.zingo.pc/config/Zingo PC), so a fresh Flatpak
// starts with an EMPTY wallets.json even though the old ~/.config/Zingo PC data
// (and the .dat wallet files it points at) are intact. Unlike MAS, the manifest
// grants --filesystem=home, so we read the old folder directly (a confirm, not a
// folder picker). Only the deb/AppImage -> Flatpak direction is handled; the
// reverse is rare and intentionally left out. settings.json carries
// all.walletDirPath, so migrating it reconnects the app to the existing .dat
// wallet files (reachable via --filesystem=home) with no copy of the wallets.
async function maybeRunDebAppImageToFlatpakMigration() {
  if (process.platform !== "linux" || !process.env.FLATPAK_ID) return;

  const userData = app.getPath("userData");
  const marker = path.join(userData, ".flatpak-migration-checked");
  const fileNames = ["settings.json", "wallets.json", "AddressBook.json"];

  if (fs.existsSync(marker)) return;

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

  // Sandbox already has data: nothing to import; mark and skip (also handles
  // upgrades from a prior Flatpak build predating this code).
  if (fileNames.some((f) => fs.existsSync(resolveDataFile(userData, f)))) {
    markChecked();
    return;
  }

  // The old non-sandbox location. os.userInfo().homedir is the real home from
  // the passwd db (reliable inside the Flatpak sandbox, where $HOME may differ).
  const sourceDir = path.join(os.userInfo().homedir, ".config", "Zingo PC");
  const present = fileNames.filter((f) => fs.existsSync(resolveDataFile(sourceDir, f)));

  // No previous data → fresh install; don't bother the user.
  if (present.length === 0) {
    markChecked();
    logMig(`no previous data at ${sourceDir}`);
    return;
  }

  const { response: choice } = await dialog.showMessageBox(null, {
    type: "question",
    title: "Import previous installation?",
    message: "A previous Zingo PC installation was found.",
    detail:
      "The Flatpak version stores its data in a separate location, so your wallets " +
      "from the deb/AppImage version are not visible yet. Click Import to bring over " +
      "your wallets, address book, and settings.\n\nIf this is a fresh install, click Skip.",
    buttons: ["Import", "Skip"],
    defaultId: 0,
    cancelId: 1,
  });

  if (choice !== 0) {
    markChecked();
    logMig("user chose skip");
    return;
  }

  const copied = [];
  const failed = [];
  for (const f of present) {
    try {
      const destPath = resolveDataFile(userData, f);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      if (f === "settings.json") {
        // currentwalletid from the old install may point to an id we don't have
        // yet — null it so the app opens the first wallet found.
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
    message: copied.length > 0 ? "Import complete." : "Import failed.",
    detail:
      (copied.length > 0 ? `Imported: ${copied.join(", ")}\n` : "") +
      (failed.length > 0 ? `Failed: ${failed.join(", ")}\n` : "") +
      "\nZingo PC will now use your previous wallets and settings.",
    buttons: ["OK"],
  });
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

  // Warm the mainnet registry before the renderer exists. By the time
  // LoadingScreen asks, the request has usually already landed, so `auto` costs
  // the launch nothing. Testnet is fetched on demand — far rarer, and no reason
  // to spend a second clearnet request on every launch.
  serverRegistry.load("main");

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
  await maybeRunDebAppImageToFlatpakMigration();

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
