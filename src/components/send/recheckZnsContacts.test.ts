import { recheckZnsContacts } from "./recheckZnsContacts";
import { AddressBookEntryClass, ServerChainNameEnum, ToAddrClass, ZEC_SWAP_CHAIN } from "../appstate";

jest.mock("../../electronBridge");

const MAIN = ServerChainNameEnum.mainChainName;

const row = (to: string, znsAlias = ""): ToAddrClass => {
  const toaddr = new ToAddrClass();
  toaddr.to = to;
  toaddr.znsAlias = znsAlias;
  return toaddr;
};

const pepe = new AddressBookEntryClass("Pepe", "u1old", MAIN, ZEC_SWAP_CHAIN, "pepe.zec");
const bob = new AddressBookEntryClass("Bob", "u1bob", MAIN, ZEC_SWAP_CHAIN);

describe("recheckZnsContacts", () => {
  it("moves a payment to where the name points now, and says it changed", async () => {
    const toaddr = row("u1old");
    const resolve = jest.fn(async () => ({ ok: true as const, address: "u1new" }));

    const result = await recheckZnsContacts([toaddr], [pepe], MAIN, resolve);

    expect(resolve).toHaveBeenCalledWith("pepe.zec", MAIN);
    expect(result.checks[toaddr.id]).toEqual({ kind: "changed", alias: "pepe.zec", previous: "u1old" });
    expect(result.moved).toEqual([{ id: toaddr.id, alias: "pepe.zec", address: "u1new" }]);
    expect(result.gone).toEqual([]);
  });

  it("says nothing when the name still points to the saved address", async () => {
    const toaddr = row("u1old");
    const result = await recheckZnsContacts([toaddr], [pepe], MAIN, async () => ({ ok: true, address: "u1old" }));
    expect(result).toEqual({ checks: {}, moved: [], gone: [] });
  });

  it("finds the contact by its name once an earlier check moved the payment", async () => {
    const toaddr = row("u1new", "pepe.zec");
    const result = await recheckZnsContacts([toaddr], [pepe], MAIN, async () => ({ ok: true, address: "u1new" }));
    expect(result.checks[toaddr.id]).toEqual({ kind: "changed", alias: "pepe.zec", previous: "u1old" });
    expect(result.moved).toEqual([]);
  });

  it("stops the payment when nobody holds the name any more", async () => {
    const result = await recheckZnsContacts([row("u1old")], [pepe], MAIN, async () => ({
      ok: false,
      reason: "not-found",
    }));
    expect(result.gone).toEqual(["pepe.zec"]);
  });

  it("pays the saved address, and says so, when the resolver does not answer", async () => {
    const toaddr = row("u1old");
    const slow = () => new Promise<never>(() => undefined);
    const result = await recheckZnsContacts([toaddr], [pepe], MAIN, slow, 10);
    expect(result.checks[toaddr.id]).toEqual({ kind: "unchecked", alias: "pepe.zec" });
    expect(result.moved).toEqual([]);
  });

  it("asks nothing for recipients that are not contacts saved from a name", async () => {
    const resolve = jest.fn();
    await recheckZnsContacts(
      [row("u1bob"), row("u1stranger")],
      [bob, pepe],
      ServerChainNameEnum.testChainName,
      resolve,
    );
    await recheckZnsContacts([row("u1bob"), row("u1stranger")], [bob, pepe], MAIN, resolve);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("asks each name once however many recipients pay it", async () => {
    const resolve = jest.fn(async () => ({ ok: true as const, address: "u1old" }));
    await recheckZnsContacts([row("u1old"), row("u1old")], [pepe], MAIN, resolve);
    expect(resolve).toHaveBeenCalledTimes(1);
  });
});
