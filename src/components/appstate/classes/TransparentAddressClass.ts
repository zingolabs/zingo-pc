import { AddressScopeEnum } from "../enums/AddressScopeEnum";

export default class TransparentAddressClass {
  account: number;
  address_index: number;
  scope: AddressScopeEnum;
  encoded_address: string;
  constructor(account: number, address_index: number, scope: AddressScopeEnum, encoded_address: string) {
    this.account = account;
    this.address_index = address_index;
    this.scope = scope;
    this.encoded_address = encoded_address;
  }
}
