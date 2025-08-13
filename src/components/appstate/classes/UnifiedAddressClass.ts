import { AddressKindEnum } from '../enums/AddressKindEnum';

export default class UnifiedAddressClass {
  index: number;
  address: string;
  addressKind: AddressKindEnum.unified;
  has_orchard: boolean;
  has_sapling: boolean;
  has_transparent: boolean;

  balance: number;

  constructor(
    index: number, 
    address: string, 
    addressKind: AddressKindEnum.unified, 
    has_orchard: boolean, 
    has_sapling: boolean, 
    has_transparent: boolean,
  ) {
    this.index = index;
    this.address = address;
    this.addressKind = addressKind;
    this.has_orchard = has_orchard;
    this.has_sapling = has_sapling;
    this.has_transparent = has_transparent;

    this.balance = 0;
  }
}
