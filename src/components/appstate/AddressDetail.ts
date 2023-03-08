import { AddressType } from "./AddressType";

export class AddressDetail {
    address: string;
    type: AddressType;
    account?: number;
    diversifier?: number;
    receivers?: string;
  
    constructor(address: string, type: AddressType, account?: number, diversifier?: number) {
      this.address = address;
      this.type = type;
      this.account = account;
      this.diversifier = diversifier;
    }
  }
