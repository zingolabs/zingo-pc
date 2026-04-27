const { app, BrowserWindow, Menu, shell, ipcMain } = require("electron");
const path = require("path");
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
    const subMenuViewDev = {
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
          label: "Select Block &Explorer",
          accelerator: "Ctrl+E",
          click: () => {
            mainWindow.webContents.send("blockexplorer");
          },
        },
      ],
    };
    const subMenuViewProd = {
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
          label: "Select Block &Explorer",
          accelerator: "Ctrl+E",
          click: () => {
            mainWindow.webContents.send("blockexplorer");
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

    const subMenuView = process.env.NODE_ENV === "development" ? subMenuViewDev : subMenuViewProd;

    return [subMenuAbout, subMenuEdit, subMenuView, subMenuWindow, subMenuHelp];
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
            label: "Select Block &Explorer",
            accelerator: "Ctrl+E",
            click: () => {
              mainWindow.webContents.send("blockexplorer");
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
ipcMain.handle("loadSettings", async () => settings.get("all"));
ipcMain.handle("saveSettings", async (_e, kv) => settings.set(`all.${kv.key}`, kv.value));
ipcMain.handle("wallets:all", async () => getWallets());
ipcMain.handle("wallets:get", async (_e, id) => getWallet(id));
ipcMain.handle("wallets:add", async (_e, wallet) => addWallet(wallet));
ipcMain.handle("wallets:update", async (_e, wallet) => updateWallet(wallet));
ipcMain.handle("wallets:remove", async (_e, id) => removeWallet(id));
ipcMain.handle("wallets:clear", async () => clearWallets());
ipcMain.handle("get-app-data-path", () => app.getPath("appData"));

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
      sandbox: false,
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

    // Failsafe, timeout after 5 seconds
    setTimeout(() => {
      waitingForClose = false;
      proceedToClose = true;
      console.log("Timeout, quitting");
      app.quit();
    }, 5 * 1000);
  });

  // Open DevTools if in dev mode
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

app.commandLine.appendSwitch("in-process-gpu");

// Windows/Linux cold start: the zcash: URI is passed as a command-line argument.
if (process.platform !== "darwin") {
  const coldStartUri = process.argv.find((a) => a.startsWith("zcash:"));
  if (coldStartUri) pendingZcashUri = coldStartUri;
}

// Create a new browser window by invoking the createWindow
// function once the Electron application is initialized.
// Install REACT_DEVELOPER_TOOLS as well if isDev
app.whenReady().then(async () => {
  // Register zcash: protocol handler at runtime.
  // - MAS: handled declaratively via protocols in package.json (sandbox forbids this call).
  // - Windows/Linux packaged: the installer registers it, but calling this too doesn't hurt.
  // - Dev mode on any platform: needed because electron-builder hasn't run.
  if (!process.mas) {
    if (process.defaultApp) {
      // Dev mode: electron.exe is the executable, so we must pass the app path explicitly
      // so the OS knows where to find the app when the protocol is invoked.
      app.setAsDefaultProtocolClient("zcash", process.execPath, [app.getAppPath()]);
    } else {
      app.setAsDefaultProtocolClient("zcash");
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
