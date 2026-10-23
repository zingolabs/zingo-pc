import { walletNotFoundMessage } from "./walletNotFoundMessage";

describe("walletNotFoundMessage", () => {
  it("says where the file was looked for, and that the wallet is kept", () => {
    const message = walletNotFoundMessage({ fileName: "zingo-wallet-4.dat", path: "/new/zingo-wallet-4.dat" });
    expect(message).toContain("not found at /new/zingo-wallet-4.dat");
    expect(message).toContain("still in your list");
  });

  it("points to where it was last opened from when it is still there", () => {
    const message = walletNotFoundMessage({
      fileName: "zingo-wallet-4.dat",
      path: "/new/zingo-wallet-4.dat",
      lastKnownPath: "/old/zingo-wallet-4.dat",
      lastKnownExists: true,
    });
    expect(message).toContain("last opened from /old/zingo-wallet-4.dat, and it is still there");
  });

  it("says so when it is gone from there too", () => {
    const message = walletNotFoundMessage({
      fileName: "zingo-wallet-4.dat",
      path: "/new/zingo-wallet-4.dat",
      lastKnownPath: "/old/zingo-wallet-4.dat",
      lastKnownExists: false,
    });
    expect(message).toContain("it is not there either");
  });
});
