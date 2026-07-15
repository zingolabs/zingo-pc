// True once the wallet has synced to (or past) the Ironwood (NU6.3) activation
// block that zingolib reports for its chain — surfaced as
// `info.nu63ActivationHeight` (see RPC.fetchIronwoodActivationHeight). The height
// is read from zingolib rather than hard-coded, so it is correct for every chain
// (mainnet, testnet, regtest/regchest). An activationHeight <= 0 means unknown /
// not scheduled yet, so there is nothing to show.
export const ironwoodReady = (activationHeight: number, walletHeight: number): boolean =>
  activationHeight > 0 && walletHeight >= activationHeight;
