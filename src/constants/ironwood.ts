// True once the wallet has synced to (or past) the Ironwood (NU6.3) activation
// block that zingolib reports for its chain — surfaced as
// `info.nu63ActivationHeight` (see RPC.fetchIronwoodActivationHeight). The height
// is read from zingolib rather than hard-coded, so it is correct for every chain
// (mainnet, testnet, regtest/regchest). An activationHeight <= 0 means unknown /
// not scheduled yet, so there is nothing to show.
export const ironwoodReady = (activationHeight: number, walletHeight: number): boolean =>
  activationHeight > 0 && walletHeight >= activationHeight;

// A unified address still encodes an Orchard receiver, and the protocol carries
// what lands there through to Ironwood, since Orchard is frozen. The app calls
// that receiver Ironwood all the same (decided 2026-09-15): not strictly what the
// address encodes, but Ironwood is where the money ends up, and it is the
// shielded pool users should come to think of as theirs.
//
// "Orchard" stays only where it names funds that still have to move: the
// "Orchard (legacy)" balance and the migration screens.
export const IRONWOOD_RECEIVER_LABEL = "Ironwood";
