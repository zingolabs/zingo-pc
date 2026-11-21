/**
 * @jest-environment node
 */

const { appOriginFor, isTrustedSender, guardIpcHandle } = require("../../public/ipcSender");

const PROD = appOriginFor(false);
const mainFrame = (url) => ({ senderFrame: { parent: null, url } });

describe("isTrustedSender", () => {
  it("Tests that the app's own page is trusted when it is the top frame", () => {
    expect(isTrustedSender(mainFrame("file:///opt/Zingo PC/build/index.html#/send"), PROD)).toBe(true);
    expect(isTrustedSender(mainFrame("http://localhost:3000/"), appOriginFor(true))).toBe(true);
  });

  it("Tests that a sender is refused when it is a subframe, a foreign page or gone", () => {
    expect(isTrustedSender({ senderFrame: { parent: {}, url: "file:///x/index.html" } }, PROD)).toBe(false);
    expect(isTrustedSender(mainFrame("https://evil.example/"), PROD)).toBe(false);
    expect(isTrustedSender(mainFrame("http://localhost:3000/"), PROD)).toBe(false);
    expect(isTrustedSender({ senderFrame: null }, PROD)).toBe(false);
    expect(isTrustedSender({}, PROD)).toBe(false);
  });
});

describe("guardIpcHandle", () => {
  const install = () => {
    const registered = {};
    const ipcMain = {
      handle(channel, listener) {
        registered[channel] = listener;
      },
    };
    guardIpcHandle(ipcMain, PROD);
    ipcMain.handle("native:get_seed", (_e, arg) => `seed:${arg}`);
    return registered["native:get_seed"];
  };

  it("Tests that a handler runs when the sender is trusted", () => {
    expect(install()(mainFrame("file:///x/index.html"), "a")).toBe("seed:a");
  });

  it("Tests that a handler throws when the sender is not trusted", () => {
    expect(() => install()(mainFrame("https://evil.example/"), "a")).toThrow("ipc sender rejected: native:get_seed");
  });
});
