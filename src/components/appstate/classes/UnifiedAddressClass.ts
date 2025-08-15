export default class UnifiedAddressClass {
  account: number;
  address_index: number;
  encoded_address: string;
  has_orchard: boolean;
  has_sapling: boolean;
  has_transparent: boolean;
  constructor(
    account: number,
    address_index: number, 
    encoded_address: string, 
    has_orchard: boolean, 
    has_sapling: boolean, 
    has_transparent: boolean,
  ) {
    this.account = account;
    this.address_index = address_index;
    this.encoded_address = encoded_address;
    this.has_orchard = has_orchard;
    this.has_sapling = has_sapling;
    this.has_transparent = has_transparent;
  }
}
