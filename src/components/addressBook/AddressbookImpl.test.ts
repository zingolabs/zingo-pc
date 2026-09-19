import AddressbookImpl from "./AddressbookImpl";
import { AddressBookEntryClass, ServerChainNameEnum, ZEC_SWAP_CHAIN } from "../appstate";
import Utils from "../../utils/utils";

jest.mock("../../electronBridge");
jest.mock("../../utils/zns", () => ({ ...jest.requireActual("../../utils/zns"), resolveZnsAlias: jest.fn() }));

const MAIN = ServerChainNameEnum.mainChainName;
const TEST = ServerChainNameEnum.testChainName;
const contact = (label: string, address: string, chain = MAIN, swapChain = ZEC_SWAP_CHAIN) =>
  new AddressBookEntryClass(label, address, chain, swapChain);

/**
 * Contacts stored as a ZNS alias move to the address it resolves to, since
 * every screen labelling a transaction looks the label up by address.
 */
describe("AddressbookImpl.resolveStoredZnsAliases", () => {
  it("asks once per name and network, and keeps only what resolved", async () => {
    const resolve = jest.fn(async (alias: string) =>
      alias.startsWith("pepe")
        ? { ok: true as const, address: "u1pepe" }
        : { ok: false as const, reason: "not-found" as const },
    );
    const resolved = await AddressbookImpl.resolveStoredZnsAliases(
      [contact("a", "pepe.zec"), contact("b", "pepe.zcash"), contact("c", "ghost.zec"), contact("d", "u1plain")],
      resolve,
    );

    expect(resolve).toHaveBeenCalledTimes(2);
    expect([...resolved]).toEqual([["main:pepe", "u1pepe"]]);
  });

  it("resolves each alias on the network its contact is on", async () => {
    const resolve = jest.fn(async (_alias: string, chain: string) => ({ ok: true as const, address: `u-${chain}` }));
    const resolved = await AddressbookImpl.resolveStoredZnsAliases(
      [contact("a", "pepe.zec", MAIN), contact("b", "pepe.zec", TEST)],
      resolve,
    );
    expect(resolved.get("main:pepe")).toBe("u-main");
    expect(resolved.get("test:pepe")).toBe("u-test");
  });

  // Startup must not wait on a resolver that never answers.
  it("gives up on a lookup that takes too long, and on one that throws", async () => {
    const resolve = jest.fn((alias: string) =>
      alias.startsWith("slow") ? new Promise<never>(() => undefined) : Promise.reject(new Error("offline")),
    );
    const resolved = await AddressbookImpl.resolveStoredZnsAliases(
      [contact("a", "slow.zec"), contact("b", "boom.zec")],
      resolve,
      10,
    );
    expect(resolved.size).toBe(0);
  });

  it("asks nothing when no contact is an alias", async () => {
    const resolve = jest.fn();
    await AddressbookImpl.resolveStoredZnsAliases([contact("d", "u1plain")], resolve);
    expect(resolve).not.toHaveBeenCalled();
  });
});

describe("AddressbookImpl.migrateZnsAliases", () => {
  it("stores the address and moves the alias to the end of the label", () => {
    const { migrated, changed } = AddressbookImpl.migrateZnsAliases(
      [contact("Pepe", "pepe.zec")],
      new Map([["main:pepe", "u1pepe"]]),
    );
    expect(changed).toBe(true);
    expect(migrated).toEqual([contact("Pepe (pepe.zec)", "u1pepe")]);
  });

  // Tried again at the next start.
  it("keeps a contact whose alias did not resolve as it is", () => {
    const entries = [contact("Ghost", "ghost.zec"), contact("Bob", "u1bob")];
    const { migrated, changed } = AddressbookImpl.migrateZnsAliases(entries, new Map());
    expect(changed).toBe(false);
    expect(migrated).toEqual(entries);
  });

  it("folds an alias into the contact that already holds its address", () => {
    const { migrated } = AddressbookImpl.migrateZnsAliases(
      [contact("Pepe", "u1pepe"), contact("Pepe ZNS", "pepe.zec")],
      new Map([["main:pepe", "u1pepe"]]),
    );
    expect(migrated).toEqual([contact("Pepe (pepe.zec)", "u1pepe")]);
  });

  it("keeps one contact for two aliases of one address", () => {
    const { migrated } = AddressbookImpl.migrateZnsAliases(
      [contact("Pepe", "pepe.zec"), contact("Pepito", "pepito.zec")],
      new Map([
        ["main:pepe", "u1pepe"],
        ["main:pepito", "u1pepe"],
      ]),
    );
    expect(migrated).toEqual([contact("Pepe (pepe.zec) (pepito.zec)", "u1pepe")]);
  });

  // The same address on the other network is another contact.
  it("does not fold across networks", () => {
    const { migrated } = AddressbookImpl.migrateZnsAliases(
      [contact("Pepe test", "u1pepe", TEST), contact("Pepe", "pepe.zec", MAIN)],
      new Map([["main:pepe", "u1pepe"]]),
    );
    expect(migrated).toEqual([contact("Pepe test", "u1pepe", TEST), contact("Pepe (pepe.zec)", "u1pepe", MAIN)]);
  });

  it("changes nothing when run again", () => {
    const resolved = new Map([["main:pepe", "u1pepe"]]);
    const once = AddressbookImpl.migrateZnsAliases([contact("Pepe", "pepe.zec")], resolved).migrated;
    const twice = AddressbookImpl.migrateZnsAliases(once, resolved);
    expect(twice.changed).toBe(false);
    expect(twice.migrated).toEqual(once);
  });
});

describe("AddressbookImpl.migrateChainIfMissing", () => {
  // Saved as TRX, a Tron contact matched no asset in SwapKit's catalog (TRON),
  // so Swap To from it did nothing.
  it("renames chain codes SwapKit spells otherwise", async () => {
    const { migrated, changed } = await AddressbookImpl.migrateChainIfMissing([
      new AddressBookEntryClass("usdt", "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb", ServerChainNameEnum.mainChainName, "TRX"),
      new AddressBookEntryClass("gno", "0xabc", ServerChainNameEnum.mainChainName, "GNOSIS"),
      new AddressBookEntryClass("pol", "0xdef", ServerChainNameEnum.mainChainName, "MATIC"),
    ]);
    expect(changed).toBe(true);
    expect(migrated.map((e) => e.swapChain)).toEqual(["TRON", "GNO", "POL"]);
    expect(migrated[0].address).toBe("T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb");
  });

  beforeEach(() => {
    jest.spyOn(Utils, "detectAddressChain").mockResolvedValue(ServerChainNameEnum.mainChainName);
  });
  afterEach(() => jest.restoreAllMocks());

  it("leaves an entry that already carries both fields untouched", async () => {
    const entry = new AddressBookEntryClass("btc", "bc1qxyz", ServerChainNameEnum.mainChainName, "BTC");
    const { migrated, changed } = await AddressbookImpl.migrateChainIfMissing([entry]);
    expect(changed).toBe(false);
    expect(migrated[0]).toBe(entry);
  });

  // Everything written before the field existed was a Zcash address, because
  // there was no way to store anything else.
  it("stamps a pre-swaps entry as ZEC while detecting its network", async () => {
    const { migrated, changed } = await AddressbookImpl.migrateChainIfMissing([
      new AddressBookEntryClass("old", "u1abc"),
    ]);
    expect(changed).toBe(true);
    expect(migrated[0].swapChain).toBe(ZEC_SWAP_CHAIN);
    expect(migrated[0].chain).toBe(ServerChainNameEnum.mainChainName);
  });

  // The `chain`-only migration shipped before `swapChain` existed, so entries
  // carrying just the first one have to survive the second pass.
  it("adds swapChain without re-detecting a network the entry already has", async () => {
    const { migrated, changed } = await AddressbookImpl.migrateChainIfMissing([
      new AddressBookEntryClass("tagged", "utest1abc", ServerChainNameEnum.testChainName),
    ]);
    expect(changed).toBe(true);
    expect(migrated[0].swapChain).toBe(ZEC_SWAP_CHAIN);
    expect(migrated[0].chain).toBe(ServerChainNameEnum.testChainName);
    expect(Utils.detectAddressChain).not.toHaveBeenCalled();
  });

  it("defaults a ZNS alias to mainnet rather than probing an address it cannot parse", async () => {
    const { migrated } = await AddressbookImpl.migrateChainIfMissing([new AddressBookEntryClass("zns", "alice.zcash")]);
    expect(migrated[0].chain).toBe(ServerChainNameEnum.mainChainName);
    expect(migrated[0].swapChain).toBe(ZEC_SWAP_CHAIN);
    expect(Utils.detectAddressChain).not.toHaveBeenCalled();
  });

  it("falls back to mainnet when the network cannot be detected", async () => {
    jest.spyOn(Utils, "detectAddressChain").mockResolvedValue(null);
    const { migrated } = await AddressbookImpl.migrateChainIfMissing([new AddressBookEntryClass("odd", "???")]);
    expect(migrated[0].chain).toBe(ServerChainNameEnum.mainChainName);
  });
});
