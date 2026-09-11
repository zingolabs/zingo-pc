/**
 * What getting a swap address wrong costs, which is not the same on both
 * sides.
 *
 * The opening is shared because the instruction is: the chain check catches an
 * address for the wrong network, and nothing catches a well-formed address on
 * the right chain that belongs to someone else. Reading it is the only check
 * left.
 *
 * What follows differs because the two addresses are used at different times.
 * A destination takes every swap, so a wrong one is a loss that has already
 * happened by the time anyone notices. A refund address is touched only when a
 * swap has to be returned, so a wrong one costs nothing until the day it is
 * needed, and everything on that day.
 *
 * Neither names a figure or a provider. It holds for all four and for every
 * sum, and it is not that a provider declines to return those funds — it never
 * receives them. A threshold read off a support policy would suggest cover
 * above it that nobody promises.
 */
const CHECK_THE_ADDRESS = "Check this address character by character.";

/** Where the bought asset lands. Every swap ends here. */
export const DESTINATION_ADDRESS_WARNING = `${CHECK_THE_ADDRESS} A swap sent to the wrong one cannot be recovered by anyone.`;

/** Where the sold asset returns if the swap fails. Most swaps never use it. */
export const REFUND_ADDRESS_WARNING = `${CHECK_THE_ADDRESS} If this swap has to be returned, a wrong one sends it somewhere nobody can reach.`;
