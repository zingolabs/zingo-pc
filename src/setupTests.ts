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
