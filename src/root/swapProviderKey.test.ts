import routes from "../constants/routes.json";
import { NO_WALLET_KEY, nextSwapProviderKey } from "./swapProviderKey";

describe("nextSwapProviderKey", () => {
  it("holds the key it is given while the loading route is on screen", () => {
    // The wallet is set halfway through the loading screen's own work. Moving
    // the key here is what remounted it and ran its startup a second time.
    expect(nextSwapProviderKey(NO_WALLET_KEY, routes.LOADING, 9)).toBe(NO_WALLET_KEY);
    expect(nextSwapProviderKey(4, routes.LOADING, 9)).toBe(4);
  });

  it("takes the open wallet on the render that leaves the loading route", () => {
    expect(nextSwapProviderKey(NO_WALLET_KEY, routes.DASHBOARD, 9)).toBe(9);
  });

  it("keeps naming the same wallet on every later render", () => {
    expect(nextSwapProviderKey(9, routes.HISTORY, 9)).toBe(9);
    expect(nextSwapProviderKey(9, routes.SWAP, 9)).toBe(9);
  });

  it("rebinds when the open wallet changes", () => {
    expect(nextSwapProviderKey(9, routes.DASHBOARD, 4)).toBe(4);
  });

  it("falls back to the no-wallet key when no wallet is open", () => {
    expect(nextSwapProviderKey(9, routes.DASHBOARD, undefined)).toBe(NO_WALLET_KEY);
  });
});
