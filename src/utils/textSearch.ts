/**
 * The one way this wallet searches a list.
 *
 * Every word typed has to appear somewhere in the row, and case and accents
 * are ignored: a list is searched from memory, and memory does not keep
 * accents. Shared so the address book, the messages, the history, the servers
 * and the pickers all answer the same query the same way.
 */

export const normaliseForSearch = (text: string): string => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Whether every word of `query` appears in `haystack`. An empty query matches. */
export function matchesAllWords(haystack: string, query: string): boolean {
  const words = normaliseForSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = normaliseForSearch(haystack);
  return words.every((word) => text.includes(word));
}
