/**
 * The name a new wallet gets when the user leaves the alias empty, also shown
 * as the field's placeholder: `Wallet N`, N one past the wallets there are,
 * moved up past any alias already taken.
 */
export function defaultWalletAlias(aliases: string[]): string {
  const taken = new Set(aliases);
  let n = aliases.length + 1;
  while (taken.has(`Wallet ${n}`)) n++;
  return `Wallet ${n}`;
}
