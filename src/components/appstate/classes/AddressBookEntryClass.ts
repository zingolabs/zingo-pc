import { ServerChainNameEnum } from "../enums/ServerChainNameEnum";

/** The `swapChain` of every contact that predates multi-chain entries. */
export const ZEC_SWAP_CHAIN = "ZEC";

export default class AddressBookEntryClass {
  label: string;
  address: string;
  // Zcash network this entry belongs to (main/test/regtest). Older versions of
  // the address book did not tag entries, so this can be undefined on disk —
  // AddressbookImpl runs a one-shot migration on read that fills it in. A
  // non-ZEC contact carries `mainChainName`, since swaps are mainnet-only.
  chain?: ServerChainNameEnum;
  // SwapKit chain code of the address ('ZEC' / 'BTC' / 'ETH' / …). 'ZEC' for
  // Zcash contacts. This is what makes a Bitcoin address storable at all: the
  // Zcash network above says nothing about which chain an address belongs to.
  // Undefined on disk for entries written before swaps existed; the same
  // migration stamps those as 'ZEC'.
  swapChain?: string;

  constructor(label: string, address: string, chain?: ServerChainNameEnum, swapChain?: string) {
    this.label = label;
    this.address = address;
    this.chain = chain;
    this.swapChain = swapChain;
  }
}
