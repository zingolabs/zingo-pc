import React from "react";
import { render } from "../../test-utils";
import { native, ipcRenderer } from "../../electronBridge";

jest.mock("../../electronBridge");

// LoadingScreen is exported as named export { LoadingScreenWithLocation as LoadingScreen }
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { LoadingScreen } = require("./LoadingScreen");

const baseProps = {
  runRPCConfigure: jest.fn(),
  setInfo: jest.fn(),
  setReadOnly: jest.fn(),
  setServerUris: jest.fn(),
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
  (native.get_latest_block_server as jest.Mock).mockResolvedValue("0");
  (ipcRenderer.invoke as jest.Mock).mockResolvedValue([]);
});

test("LoadingScreen renders without crashing", () => {
  render(<LoadingScreen {...baseProps} />);
});
