import { AddressBookEntryClass, ServerChainNameEnum, ToAddrClass } from "../appstate";
import { isSameZnsAlias, resolveZnsAlias } from "../../utils/zns";
import type { ZnsResolveResult } from "../../utils/zns";

/** How long the lookup of one name may hold up opening the confirmation. */
const RECHECK_TIMEOUT_MS = 8000;

/** What the lookup right before a payment found for one recipient. */
export type ZnsCheckType =
  /** The owner pointed the name away from the address the contact holds. */
  | { kind: "changed"; alias: string; previous: string }
  /** The resolver did not answer: the payment goes to the address saved. */
  | { kind: "unchecked"; alias: string };

export type ZnsRecheckType = {
  /** By recipient id. Recipients the name still points to are absent. */
  checks: { [id: number]: ZnsCheckType };
  /** Recipients whose address has to become the one the name points to now. */
  moved: { id: number; alias: string; address: string }[];
  /** Names nobody holds any more. The payment does not go ahead. */
  gone: string[];
};

/**
 * The contact saved from a ZNS name that this recipient pays: by the address
 * the contact holds, or by the name, once an earlier check moved the
 * recipient to where the name points now.
 */
export const znsContactFor = (
  toaddr: ToAddrClass,
  addressBook: AddressBookEntryClass[],
  chain: ServerChainNameEnum,
): AddressBookEntryClass | undefined =>
  addressBook.find(
    (entry) =>
      entry.chain === chain &&
      !!entry.znsAlias &&
      (entry.address === toaddr.to || (!!toaddr.znsAlias && isSameZnsAlias(entry.znsAlias, toaddr.znsAlias))),
  );

/**
 * Resolve again, skipping the cache, the name of every recipient that is a
 * contact saved from one, and compare it with the address the contact holds.
 * Each name is asked once, all at the same time, each bounded.
 */
export const recheckZnsContacts = async (
  toaddrs: ToAddrClass[],
  addressBook: AddressBookEntryClass[],
  chain: ServerChainNameEnum,
  resolve: (alias: string, chain: ServerChainNameEnum) => Promise<ZnsResolveResult> = (alias, c) =>
    resolveZnsAlias(alias, c, { fresh: true }),
  timeoutMs: number = RECHECK_TIMEOUT_MS,
): Promise<ZnsRecheckType> => {
  const contacts = toaddrs
    .map((toaddr) => ({ toaddr, contact: znsContactFor(toaddr, addressBook, chain) }))
    .filter((pair): pair is { toaddr: ToAddrClass; contact: AddressBookEntryClass } => !!pair.contact);

  const answers = new Map<string, ZnsResolveResult | null>();
  await Promise.all(
    [...new Set(contacts.map(({ contact }) => contact.znsAlias as string))].map(async (alias) => {
      const timeout = new Promise<null>((done) => setTimeout(() => done(null), timeoutMs));
      try {
        answers.set(alias, await Promise.race([resolve(alias, chain), timeout]));
      } catch {
        answers.set(alias, null);
      }
    }),
  );

  const result: ZnsRecheckType = { checks: {}, moved: [], gone: [] };
  for (const { toaddr, contact } of contacts) {
    const alias = contact.znsAlias as string;
    const answer = answers.get(alias);
    if (answer?.ok) {
      if (answer.address !== contact.address) {
        result.checks[toaddr.id] = { kind: "changed", alias, previous: contact.address };
      }
      if (answer.address !== toaddr.to) result.moved.push({ id: toaddr.id, alias, address: answer.address });
    } else if (answer?.reason === "not-found") {
      if (!result.gone.includes(alias)) result.gone.push(alias);
    } else {
      result.checks[toaddr.id] = { kind: "unchecked", alias };
    }
  }
  return result;
};
