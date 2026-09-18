/**
 * Finding a contact by any part of its name or address.
 *
 * Each word typed has to appear somewhere, in the name or in the address, so
 * "pepe u1ab" narrows to the Pepe whose address starts that way. Case and
 * accents are ignored ("jose" finds "José"): a long address book is searched
 * by memory, and memory does not keep accents.
 */

const normalise = (text: string): string => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function contactMatches(contact: { label: string; address: string }, query: string): boolean {
  const words = normalise(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = `${normalise(contact.label)} ${normalise(contact.address)}`;
  return words.every((word) => haystack.includes(word));
}

export function filterContacts<T extends { label: string; address: string }>(
  contacts: readonly T[],
  query: string,
): T[] {
  return contacts.filter((contact) => contactMatches(contact, query));
}
