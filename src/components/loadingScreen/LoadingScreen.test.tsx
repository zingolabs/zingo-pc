import React from "react";
import { render, waitFor } from "../../test-utils";
import { native, ipcRenderer } from "../../electronBridge";
import {
  CreationTypeEnum,
  PerformanceLevelEnum,
  ServerChainNameEnum,
  ServerClass,
  ServerSelectionEnum,
  WalletType,
} from "../appstate";
import fetchServerList from "../../utils/fetchServerList";

jest.mock("../../electronBridge");
jest.mock("../../utils/fetchServerList");

const liveList = fetchServerList as jest.MockedFunction<typeof fetchServerList>;

const liveServer = (uri: string, chain = ServerChainNameEnum.mainChainName): ServerClass => ({
  uri,
  chain_name: chain,
  latency: null,
  default: false,
  obsolete: false,
});

const probedUris = () => (native.get_latest_block_server as jest.Mock).mock.calls.map(([uri]) => uri);

// LoadingScreen is exported as named export { LoadingScreenWithLocation as LoadingScreen }
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { LoadingScreen } = require("./LoadingScreen");

const baseProps = {
  runRPCConfigure: jest.fn(),
  setInfo: jest.fn(),
  setReadOnly: jest.fn(),
  navigateToDashboard: jest.fn(),
  setBirthday: jest.fn(),
  setPools: jest.fn(),
  setWallets: jest.fn(),
  setCurrentWallet: jest.fn(),
  setCurrentWalletOpenError: jest.fn(),
  setFetchError: jest.fn(),
  setBlockExplorer: jest.fn(),
};

beforeEach(() => {
  // componentDidMount calls these — return false/empty so it doesn't try to init wallets
  (native.wallet_exists as jest.Mock).mockResolvedValue(false);
  (native.wallet_kind as jest.Mock).mockResolvedValue("");
  (native.set_crypto_default_provider_to_ring as jest.Mock).mockResolvedValue(undefined);
  (native.get_latest_block_server as jest.Mock).mockReset().mockResolvedValue("0");
  (ipcRenderer.invoke as jest.Mock).mockResolvedValue([]);
  // Registry silent by default, so every test that doesn't care about it runs
  // against the static list.
  liveList.mockReset().mockResolvedValue([]);
});

test("LoadingScreen renders without crashing", () => {
  render(<LoadingScreen {...baseProps} />);
});

// Boot with the mode the user picked, and read back what got persisted.
const bootWithSelection = (
  selection: ServerSelectionEnum,
  uri: string,
  chain: ServerChainNameEnum = ServerChainNameEnum.mainChainName,
) => {
  const wallet: WalletType = {
    id: 1,
    fileName: "",
    alias: "Main Wallet",
    chain_name: chain,
    creationType: CreationTypeEnum.Main,
    uri,
    selection,
    performanceLevel: PerformanceLevelEnum.High,
  };
  // The wallet file has to be there: a missing one sends componentDidMount
  // round again, which never terminates against a fixed wallets list.
  (native.wallet_exists as jest.Mock).mockResolvedValue(true);
  (native.init_from_b64 as jest.Mock).mockResolvedValue('{"birthday":0}');
  (native.wallet_kind as jest.Mock).mockResolvedValue(
    '{"kind":"Loaded from unified full viewing key","orchard":true,"sapling":true,"transparent":true}',
  );
  (ipcRenderer.invoke as jest.Mock).mockImplementation(async (channel: string) => {
    switch (channel) {
      case "wallets:all":
        return [wallet];
      case "loadSettings":
        return {
          serveruri: uri,
          serverchain_name: chain,
          serverselection: selection,
          currentwalletid: 1,
        };
      default:
        return undefined;
    }
  });
  render(<LoadingScreen {...baseProps} />);
};

const savedSetting = (key: string) =>
  (ipcRenderer.invoke as jest.Mock).mock.calls
    .filter(([channel, kv]) => channel === "saveSettings" && kv?.key === key)
    .map(([, kv]) => kv.value);

const savedSelection = () => savedSetting("serverselection");

// `auto` used to be written back as `list` on the first boot, pinning the
// wallet to whichever server won that one race and showing the user a mode
// they never chose.
test("auto survives a boot instead of degrading to list", async () => {
  bootWithSelection(ServerSelectionEnum.auto, "https://zec.rocks:443");

  await waitFor(() => expect(savedSelection().length).toBeGreaterThan(0));
  expect(savedSelection()).not.toContain(ServerSelectionEnum.list);
  expect(savedSelection()).toContain(ServerSelectionEnum.auto);
});

// An `auto` wallet parked on a server that has since been marked obsolete
// takes the obsolete-rewrite path. That path also used to force `list`.
test("auto survives a boot from an obsolete server", async () => {
  bootWithSelection(ServerSelectionEnum.auto, "https://lwd1.zcash-infra.com:9067");

  await waitFor(() => expect(savedSelection().length).toBeGreaterThan(0));
  expect(savedSelection()).not.toContain(ServerSelectionEnum.list);
});

test("an explicit list choice is left alone", async () => {
  bootWithSelection(ServerSelectionEnum.list, "https://eu.zec.rocks:443");

  await waitFor(() => expect(savedSelection().length).toBeGreaterThan(0));
  expect(savedSelection()).not.toContain(ServerSelectionEnum.auto);
});

test("a custom server is left alone", async () => {
  bootWithSelection(ServerSelectionEnum.custom, "https://my.own.node:443");

  await waitFor(() => expect(savedSelection().length).toBeGreaterThan(0));
  expect(savedSelection()).toContain(ServerSelectionEnum.custom);
});

// The anomaly rule: a mode whose server died is worth less than a mode that
// can recover, so it lands on `auto` rather than on a dead URI.
test("a list choice on a now-obsolete server lands on auto", async () => {
  bootWithSelection(ServerSelectionEnum.list, "https://lwd1.zcash-infra.com:9067");

  await waitFor(() => expect(savedSelection().length).toBeGreaterThan(0));
  expect(savedSelection()).toContain(ServerSelectionEnum.auto);
});

test("a custom choice on a now-obsolete server lands on auto", async () => {
  bootWithSelection(ServerSelectionEnum.custom, "https://mainnet.lightwalletd.com:9067");

  await waitFor(() => expect(savedSelection().length).toBeGreaterThan(0));
  expect(savedSelection()).toContain(ServerSelectionEnum.auto);
});

// The registry ranks by uptime and ping, so its head is the answer. Probing it
// again would only re-measure what we asked the registry for.
test("auto takes the registry's first entry without probing", async () => {
  liveList.mockResolvedValue(["https://one.zec.rocks:443", "https://two.zec.rocks:443"].map((u) => liveServer(u)));
  bootWithSelection(ServerSelectionEnum.auto, "https://zec.rocks:443");

  await waitFor(() => expect(savedSetting("serveruri").length).toBeGreaterThan(0));
  expect(savedSetting("serveruri")).toEqual(["https://one.zec.rocks:443"]);
  expect(probedUris()).toEqual([]);
  expect(savedSelection()).toEqual([ServerSelectionEnum.auto]);
});

test("auto falls back to the static list when the registry is silent", async () => {
  bootWithSelection(ServerSelectionEnum.auto, "https://zec.rocks:443");

  await waitFor(() => expect(savedSetting("serveruri").length).toBeGreaterThan(0));
  expect(probedUris()).toContain("https://zec.rocks:443");
  expect(savedSelection()).toEqual([ServerSelectionEnum.auto]);
});

// The live equivalent of the obsolete flag: still published means still a valid
// choice, gone means the choice can no longer be honoured.
test("a list server still published stays on list", async () => {
  liveList.mockResolvedValue([liveServer("https://eu.zec.rocks:443")]);
  bootWithSelection(ServerSelectionEnum.list, "https://eu.zec.rocks:443");

  await waitFor(() => expect(savedSelection().length).toBeGreaterThan(0));
  expect(savedSelection()).toEqual([ServerSelectionEnum.list]);
  expect(savedSetting("serveruri")).toEqual(["https://eu.zec.rocks:443"]);
});

test("a list server dropped from the registry lands on auto", async () => {
  liveList.mockResolvedValue([liveServer("https://na.zec.rocks:443")]);
  bootWithSelection(ServerSelectionEnum.list, "https://eu.zec.rocks:443");

  await waitFor(() => expect(savedSelection().length).toBeGreaterThan(0));
  expect(savedSelection()).toEqual([ServerSelectionEnum.auto]);
  expect(savedSetting("serveruri")).toEqual(["https://na.zec.rocks:443"]);
});

test("a custom server never asks the registry", async () => {
  bootWithSelection(ServerSelectionEnum.custom, "https://my.own.node:443");

  await waitFor(() => expect(savedSelection().length).toBeGreaterThan(0));
  expect(liveList).not.toHaveBeenCalled();
});

// Regtest publishes no servers, so `auto` has nothing to pick. Blanking the URI
// there would wipe the user's local node on every launch.
test("auto keeps its server on a chain with none listed", async () => {
  bootWithSelection(ServerSelectionEnum.auto, "http://127.0.0.1:9067", ServerChainNameEnum.regtestChainName);

  await waitFor(() => expect(savedSetting("serveruri").length).toBeGreaterThan(0));
  expect(savedSetting("serveruri")).toEqual(["http://127.0.0.1:9067"]);
  expect(savedSelection()).toEqual([ServerSelectionEnum.auto]);
});
