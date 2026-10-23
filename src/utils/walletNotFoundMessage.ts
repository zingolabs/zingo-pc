/**
 * What to tell the user when a listed wallet's file is not where zingolib
 * looks for it: where it is looked for, and where it was last opened from
 * when that was elsewhere, and whether it is still there.
 *
 * A file that moved is not a wallet the user deleted, so the wallet stays in
 * the list and this says how to bring it back.
 */
export function walletNotFoundMessage(args: {
  fileName: string;
  /** Where zingolib looks for the file now. */
  path?: string;
  /** Where the wallet was last opened from, if it ever was. */
  lastKnownPath?: string;
  /** Whether the file is still at `lastKnownPath`. */
  lastKnownExists?: boolean;
}): string {
  const { fileName, path, lastKnownPath, lastKnownExists } = args;
  let message = path
    ? `The wallet file ${fileName} was not found at ${path}.`
    : `The wallet file ${fileName} was not found.`;
  if (lastKnownPath && lastKnownPath !== path) {
    message += lastKnownExists
      ? ` It was last opened from ${lastKnownPath}, and it is still there: move or copy it to the location above to open it.`
      : ` It was last opened from ${lastKnownPath}, and it is not there either.`;
  }
  return `${message} The wallet is still in your list.`;
}
