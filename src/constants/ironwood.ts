// True once the wallet has synced to (or past) the Ironwood (NU6.3) activation
// block that zingolib reports for its chain — surfaced as
// `info.nu63ActivationHeight` (see RPC.fetchIronwoodActivationHeight). The height
// is read from zingolib rather than hard-coded, so it is correct for every chain
// (mainnet, testnet, regtest/regchest). An activationHeight <= 0 means unknown /
// not scheduled yet, so there is nothing to show.
export const ironwoodReady = (activationHeight: number, walletHeight: number): boolean =>
  activationHeight > 0 && walletHeight >= activationHeight;

// A unified address still carries an Orchard receiver — that is what the address
// encodes, and calling it an Ironwood receiver would be false. What changed is
// where the money ends up: Orchard is frozen and the protocol carries anything
// landing there through to Ironwood. So the label names the receiver and glosses
// the destination, and this line carries the mechanism wherever there is room
// for it.
//
// Not to be confused with the "Orchard (legacy)" balance, which is what arrived
// before the freeze and still needs the migration to move.
export const IRONWOOD_RECEIVER_LABEL = "Orchard (Ironwood)";
export const IRONWOOD_RECEIVER_TOOLTIP =
  "Funds sent to the Orchard receiver are moved to Ironwood by the protocol. Orchard itself is frozen.";
