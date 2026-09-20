import { matchesAllWords } from "./textSearch";

/**
 * Finding a contact by any part of its name or address, with the wallet's one
 * search rule: every word typed has to appear, ignoring case and accents. So
 * "pepe u1ab" narrows to the Pepe whose address starts that way.
 */

export function contactMatches(contact: { label: string; address: string }, query: string): boolean {
  return matchesAllWords(`${contact.label} ${contact.address}`, query);
}

export function filterContacts<T extends { label: string; address: string }>(
  contacts: readonly T[],
  query: string,
): T[] {
  return contacts.filter((contact) => contactMatches(contact, query));
}
