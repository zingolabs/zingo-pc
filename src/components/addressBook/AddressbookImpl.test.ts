import AddressbookImpl from "./AddressbookImpl";
import { AddressBookEntryClass, ServerChainNameEnum, ZEC_SWAP_CHAIN } from "../appstate";
import Utils from "../../utils/utils";

jest.mock("../../electronBridge");
jest.mock("../../utils/zns", () => ({ isZnsAlias: (a: string) => a.endsWith(".zcash") }));

describe("AddressbookImpl.migrateChainIfMissing", () => {
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
