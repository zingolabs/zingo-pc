import { ServerChainNameEnum } from "../enums/ServerChainNameEnum";

export default class AddressBookEntryClass {
  label: string;
  address: string;
  // Network this entry belongs to. Older versions of the address book did not
  // tag entries, so this can be undefined on disk — AddressbookImpl runs a
  // one-shot migration on read that fills it in.
  chain?: ServerChainNameEnum;

  constructor(label: string, address: string, chain?: ServerChainNameEnum) {
    this.label = label;
    this.address = address;
    this.chain = chain;
  }
}
