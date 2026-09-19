import type ValueTransferClass from "../components/appstate/classes/ValueTransferClass";

/**
 * Finding a message by what it said, or by who it came from or went to.
 *
 * Each word typed has to appear somewhere: in the memo text, in the address,
 * or in the name that address is saved under. Case and accents are ignored,
 * since a message is searched by memory.
 */

const normalise = (text: string): string => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function messageMatches(
  message: Pick<ValueTransferClass, "memos" | "address">,
  query: string,
  contactName?: string,
): boolean {
  const words = normalise(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalise([...(message.memos ?? []), message.address ?? "", contactName ?? ""].join(" "));
  return words.every((word) => haystack.includes(word));
}
