import AddressType from "./AddressType";
import ReceiverType from "./ReceiverType";

export default class AddressDetail {
    address: string;
    type: AddressType;
    account?: number;
    diversifier?: number;
    receivers?: ReceiverType[];
  
    constructor(address: string, type: AddressType, account?: number, diversifier?: number) {
      this.address = address;
      this.type = type;
      this.account = account;
      this.diversifier = diversifier;
    }
  }
