// Which senders may call the main process over IPC.
//
// Only the app's own top-level page. Navigation and new windows are already
// blocked, so this only matters if a subframe or a foreign page ever reaches
// the preload; then it gets nothing.
// Kept out of electron.js so it can be tested without Electron.

const appOriginFor = (isDev) => (isDev ? "http://localhost:3000" : "file://");

function isTrustedSender(event, appOrigin) {
  const frame = event && event.senderFrame;
  return !!frame && frame.parent === null && typeof frame.url === "string" && frame.url.startsWith(appOrigin);
}

/** Makes every handler registered afterwards refuse untrusted senders. */
function guardIpcHandle(ipcMain, appOrigin) {
  const handle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channel, listener) =>
    handle(channel, (event, ...args) => {
      if (!isTrustedSender(event, appOrigin)) throw new Error(`ipc sender rejected: ${channel}`);
      return listener(event, ...args);
    });
}

module.exports = { appOriginFor, isTrustedSender, guardIpcHandle };
