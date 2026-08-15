import Utils from "../utils/utils";
import { ChainNameEnum } from "./enums/ChainNameEnum";
import { isValidChainAddress } from "./addressValidators";

/** SwapKit's identifier for the Zcash chain, as it appears in asset strings. */
const ZEC_SWAP_CHAIN = "ZEC";

/**
 * Validate an address for its chain.
 *
 * - ZEC is validated by zingolib (`Utils.getAddressChainName`) against the
 *   given Zcash network (main/test/regtest) — the same check the
 *   Send/AddressBook fields already use.
 * - Every other chain uses the format-only regex validators in
 *   `addressValidators` (`isValidChainAddress`).
 *
 * Empty input validates (presence is the caller's separate concern), matching
 * `isValidChainAddress`. Async because the ZEC path parses via the native RPC.
 */
export async function validateAddressForChain(
  swapChain: string,
  address: string,
  zcashChain: ChainNameEnum = ChainNameEnum.mainChainName,
): Promise<boolean> {
  const trimmed = address.trim();
  if (trimmed.length === 0) {
    return true;
  }
  if (swapChain.toUpperCase() === ZEC_SWAP_CHAIN) {
    return (await Utils.getAddressChainName(trimmed)) === zcashChain;
  }
  return isValidChainAddress(swapChain, trimmed);
}
