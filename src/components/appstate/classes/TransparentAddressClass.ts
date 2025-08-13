import { AddressScopeEnum } from '../enums/AddressScopeEnum';
import { AddressKindEnum } from '../enums/AddressKindEnum';

export default class TransparentAddressClass {
  index: number;
  address: string;
  addressKind: AddressKindEnum.transparent;
  scope: AddressScopeEnum;

  balance: number;

  constructor(
    index: number, 
    address: string, 
    addressKind: AddressKindEnum.transparent, 
    scope: AddressScopeEnum,
  ) {
    this.index = index;
    this.address = address;
    this.addressKind = addressKind;
    this.scope = scope;

    this.balance = 0;
  }
}