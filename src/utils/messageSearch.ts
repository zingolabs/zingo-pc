import type ValueTransferClass from "../components/appstate/classes/ValueTransferClass";
import { matchesAllWords } from "./textSearch";

/**
 * Finding a message by what it said, or by who it came from or went to: the
 * memo text, the address, and the name that address is saved under, under the
 * wallet's one search rule.
 */
export function messageMatches(
  message: Pick<ValueTransferClass, "memos" | "address">,
  query: string,
  contactName?: string,
): boolean {
  return matchesAllWords([...(message.memos ?? []), message.address ?? "", contactName ?? ""].join(" "), query);
}
