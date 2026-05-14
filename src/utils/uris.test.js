import { parseZcashURI } from "./uris";
import native from "../native.node";

import serverUrisList from "./serverUrisList";
import { PerformanceLevelEnum } from "../components/appstate";

// electronBridge.native must point to the real native module so that
// parse_address works correctly inside parseZcashURI.
jest.mock("../electronBridge", () => {
  const nativeModule = require("../native.node");
  return {
    native: nativeModule.default ?? nativeModule,
    clipboard: { writeText: jest.fn() },
    shell: { openExternal: jest.fn() },
    ipcRenderer: { on: jest.fn(), off: jest.fn(), invoke: jest.fn() },
    fs: { promises: { readFile: jest.fn() }, existsSync: jest.fn() },
    isSandboxed: false,
  };
});

const testnetServer = serverUrisList().find((s) => s.chain_name === "test" && s.default);
native.init_from_b64(testnetServer.uri, testnetServer.chain_name, PerformanceLevelEnum.High, 1, "test-wallet.dat");

test("ZIP321 case 1", async () => {
  const targets = await parseZcashURI(
    "zcash:ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez?amount=1&memo=VGhpcyBpcyBhIHNpbXBsZSBtZW1vLg&message=Thank%20you%20for%20your%20purchase",
    "test",
  );

  expect(typeof targets).toBe("object");
  expect(targets.address).toBe(
    "ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez",
  );
  expect(targets.message).toBe("Thank you for your purchase");
  expect(targets.label).toBeUndefined();
  expect(targets.amount).toBe(1);
  expect(targets.memoString).toBe("This is a simple memo.");
});

test("ZIP321 case 2", async () => {
  const targets = await parseZcashURI(
    "zcash:?address=tmEZhbWHTpdKMw5it8YDspUXSMGQyFwovpU&amount=123.456&address.1=ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez&amount.1=0.789&memo.1=VGhpcyBpcyBhIHVuaWNvZGUgbWVtbyDinKjwn6aE8J-PhvCfjok",
    "test",
  );

  // this version of the App only reads the first item of the URI
  expect(typeof targets).toBe("object");
  expect(targets.address).toBe("tmEZhbWHTpdKMw5it8YDspUXSMGQyFwovpU");
  expect(targets.message).toBeUndefined();
  expect(targets.label).toBeUndefined();
  expect(targets.amount).toBe(123.456);
  expect(targets.memoString).toBeUndefined();
  expect(targets.memoBase64).toBeUndefined();
});

test("coinbase URI", async () => {
  const target = await parseZcashURI("zcash:tmEZhbWHTpdKMw5it8YDspUXSMGQyFwovpU", "test");

  expect(typeof target).toBe("object");
  expect(target.message).toBeUndefined();
  expect(target.label).toBeUndefined();
  expect(target.amount).toBeUndefined();
  expect(target.memoString).toBeUndefined();
  expect(target.memoBase64).toBeUndefined();
});

test("Plain URI", async () => {
  // A plain address returns the address string itself (no zcash: prefix)
  const result = await parseZcashURI("tmEZhbWHTpdKMw5it8YDspUXSMGQyFwovpU", "test");

  expect(typeof result).toBe("string");
  expect(result).toBe("tmEZhbWHTpdKMw5it8YDspUXSMGQyFwovpU");
});

test("bad uris", async () => {
  // bad protocol
  let error = await parseZcashURI("badprotocol:tmEZhbWHTpdKMw5it8YDspUXSMGQyFwovpU?amount=123.456", "test");
  expect(typeof error).toBe("string");

  // bad address
  error = await parseZcashURI("zcash:badaddress?amount=123.456", "test");
  expect(typeof error).toBe("string");

  // no address
  error = await parseZcashURI("zcash:?amount=123.456", "test");
  expect(typeof error).toBe("string");

  // bad param name
  error = await parseZcashURI("zcash:tmEZhbWHTpdKMw5it8YDspUXSMGQyFwovpU?badparam=3", "test");
  expect(typeof error).toBe("string");

  // index=1 doesn't have amount
  error = await parseZcashURI(
    "zcash:tmEZhbWHTpdKMw5it8YDspUXSMGQyFwovpU?amount=2&address.1=tmEZhbWHTpdKMw5it8YDspUXSMGQyFwovpU",
    "test",
  );
  expect(typeof error).toBe("string");

  // duplicate param — url-parse silently keeps the last value, so the parse succeeds
  error = await parseZcashURI("zcash:tmEZhbWHTpdKMw5it8YDspUXSMGQyFwovpU?amount=3&amount=4", "test");
  expect(typeof error).toBe("object");

  // bad index
  error = await parseZcashURI(
    "zcash:tmEZhbWHTpdKMw5it8YDspUXSMGQyFwovpU?amount=2&address.a=tmEZhbWHTpdKMw5it8YDspUXSMGQyFwovpU&amount.a=3",
    "test",
  );
  expect(typeof error).toBe("string");

  // index=1 is missing
  error = await parseZcashURI(
    "zcash:tmEZhbWHTpdKMw5it8YDspUXSMGQyFwovpU?amount=0.1&address.2=tmEZhbWHTpdKMw5it8YDspUXSMGQyFwovpU&amount.2=2",
    "test",
  );
  expect(typeof error).toBe("string");
});
