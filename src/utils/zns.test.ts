import { isZnsAlias, extractZnsName, resolveZnsAlias, _clearZnsCacheForTests } from "./zns";
import { ServerChainNameEnum } from "../components/appstate";

jest.mock("../electronBridge");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ipcRenderer } = require("../electronBridge");

describe("zns utility", () => {
  describe("isZnsAlias", () => {
    it.each([
      ["alice.zcash", true],
      ["bob123.zcash", true],
      ["Alice.zcash", true],
      // Edge hands out names in this form, against the same registry.
      ["alice.zec", true],
      ["bob123.zec", true],
      ["ALICE.ZEC", true],
      ["alice", false],
      ["alice.zcash.zcash", false],
      ["", false],
      ["u1qq...fff", false],
      ["alice space.zcash", false],
      ["alice@.zcash", false],
      // The list is closed on purpose: a suffix nobody issues is a mistyped
      // address, and resolving it would hand back someone else's.
      ["alice.zzzzzzzzzzz", false],
      ["alice.com", false],
      ["alice.zcash.zec", false],
    ])("isZnsAlias(%j) === %s", (input, expected) => {
      expect(isZnsAlias(input)).toBe(expected);
    });
  });

  describe("extractZnsName", () => {
    it("strips the suffix and lowercases", () => {
      expect(extractZnsName("Alice.zcash")).toBe("alice");
      expect(extractZnsName("BOB123.ZCASH")).toBe("bob123");
    });

    // Both suffixes name the same registration: the registry stores the bare
    // label and never sees either one.
    it("reaches the same name through either suffix", () => {
      expect(extractZnsName("alice.zec")).toBe("alice");
      expect(extractZnsName("Alice.ZEC")).toBe(extractZnsName("Alice.zcash"));
    });
    it("returns null for non-aliases", () => {
      expect(extractZnsName("alice")).toBeNull();
      expect(extractZnsName("")).toBeNull();
      expect(extractZnsName("u1qq...fff")).toBeNull();
    });
  });

  describe("resolveZnsAlias", () => {
    beforeEach(() => {
      _clearZnsCacheForTests();
      ipcRenderer.invoke.mockReset();
    });

    it("returns the address when ZNS resolves the name (IPC ok)", async () => {
      ipcRenderer.invoke.mockResolvedValue({ ok: true, address: "u1qq...mainnet" });
      const result = await resolveZnsAlias("alice.zcash", ServerChainNameEnum.mainChainName);
      expect(result).toEqual({ ok: true, address: "u1qq...mainnet" });
      expect(ipcRenderer.invoke).toHaveBeenCalledWith("zns:resolve", "alice", ServerChainNameEnum.mainChainName);
    });

    it("passes the bare name to IPC (strips .zcash)", async () => {
      ipcRenderer.invoke.mockResolvedValue({ ok: true, address: "u1qq...xxx" });
      await resolveZnsAlias("Bob123.ZCASH", ServerChainNameEnum.testChainName);
      expect(ipcRenderer.invoke).toHaveBeenCalledWith("zns:resolve", "bob123", ServerChainNameEnum.testChainName);
    });

    it("returns not-found when IPC reports not-found", async () => {
      ipcRenderer.invoke.mockResolvedValue({ ok: false, reason: "not-found" });
      const result = await resolveZnsAlias("ghost.zcash", ServerChainNameEnum.mainChainName);
      expect(result).toEqual({ ok: false, reason: "not-found" });
    });

    it("returns invalid-name for disallowed characters without calling IPC", async () => {
      const result = await resolveZnsAlias("ALICE!.zcash", ServerChainNameEnum.mainChainName);
      expect(result).toEqual({ ok: false, reason: "invalid-name" });
      expect(ipcRenderer.invoke).not.toHaveBeenCalled();
    });

    it("forwards unsupported-chain from main", async () => {
      ipcRenderer.invoke.mockResolvedValue({ ok: false, reason: "unsupported-chain" });
      const result = await resolveZnsAlias("alice.zcash", "" as ServerChainNameEnum | "");
      expect(result).toEqual({ ok: false, reason: "unsupported-chain" });
    });

    it("forwards network errors from main", async () => {
      ipcRenderer.invoke.mockResolvedValue({ ok: false, reason: "network" });
      const result = await resolveZnsAlias("alice.zcash", ServerChainNameEnum.mainChainName);
      expect(result).toEqual({ ok: false, reason: "network" });
    });

    it("caches successful resolutions and does not call IPC twice", async () => {
      ipcRenderer.invoke.mockResolvedValue({ ok: true, address: "u1qq...cached" });
      const a = await resolveZnsAlias("alice.zcash", ServerChainNameEnum.mainChainName);
      const b = await resolveZnsAlias("alice.zcash", ServerChainNameEnum.mainChainName);
      expect(a).toEqual(b);
      expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
    });

    it("caches not-found responses (negative caching)", async () => {
      ipcRenderer.invoke.mockResolvedValue({ ok: false, reason: "not-found" });
      await resolveZnsAlias("ghost.zcash", ServerChainNameEnum.mainChainName);
      await resolveZnsAlias("ghost.zcash", ServerChainNameEnum.mainChainName);
      expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
    });

    it("does NOT cache network errors (retries on next call)", async () => {
      ipcRenderer.invoke.mockResolvedValue({ ok: false, reason: "network" });
      await resolveZnsAlias("alice.zcash", ServerChainNameEnum.mainChainName);
      await resolveZnsAlias("alice.zcash", ServerChainNameEnum.mainChainName);
      expect(ipcRenderer.invoke).toHaveBeenCalledTimes(2);
    });

    it("separates cache by chain (mainnet vs testnet are different keys)", async () => {
      ipcRenderer.invoke
        .mockResolvedValueOnce({ ok: true, address: "u1qq...main" })
        .mockResolvedValueOnce({ ok: true, address: "utest1qq...test" });
      const main = await resolveZnsAlias("alice.zcash", ServerChainNameEnum.mainChainName);
      const test = await resolveZnsAlias("alice.zcash", ServerChainNameEnum.testChainName);
      expect(main).toEqual({ ok: true, address: "u1qq...main" });
      expect(test).toEqual({ ok: true, address: "utest1qq...test" });
      expect(ipcRenderer.invoke).toHaveBeenCalledTimes(2);
    });
  });
});
