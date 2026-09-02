// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import "@testing-library/jest-dom";

// jsdom does not expose the TextEncoder/TextDecoder that every browser and
// Electron renderer has, so code that encodes UTF-8 — the swap layer's memo
// paths, for one — throws only under test. Node's implementations are the same
// WHATWG ones, so borrowing them makes the environment match the app rather
// than papering over a difference.
import { TextDecoder, TextEncoder } from "util";

if (typeof globalThis.TextEncoder === "undefined") {
  globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder;
}
if (typeof globalThis.TextDecoder === "undefined") {
  globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
}

// `resetMocks` clears every mock implementation before each test, including
// the shared electronBridge mock's `ipcRenderer.on`. That one has to keep
// returning a disposer: the real bridge does, because contextBridge proxies
// any function named from the renderer and only the preload can cancel what
// it registered. A mock returning `undefined` fails at unmount with "cancel is
// not a function", which says nothing about the reset that caused it.
//
// Re-armed rather than made a plain function, so suites can still assert on
// what was subscribed.
beforeEach(() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const bridge = require("./__mocks__/electronBridge");
    if (jest.isMockFunction(bridge.ipcRenderer?.on)) {
      bridge.ipcRenderer.on.mockImplementation(() => jest.fn());
    }
  } catch {
    // A suite that mocks the bridge itself owns its own arrangement.
  }
});
