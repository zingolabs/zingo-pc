import { defaultWalletAlias } from "./defaultWalletAlias";

describe("defaultWalletAlias", () => {
  it("Tests that the first wallet is Wallet 1", () => {
    expect(defaultWalletAlias([])).toBe("Wallet 1");
  });

  it("Tests that the number is one past the wallets there are", () => {
    expect(defaultWalletAlias(["Savings", "Daily"])).toBe("Wallet 3");
  });

  it("Tests that a name already taken is skipped when a wallet was deleted", () => {
    expect(defaultWalletAlias(["Wallet 2", "Wallet 3"])).toBe("Wallet 4");
  });
});
