import AddressType from "./AddressType";
import ReceiverType from "./ReceiverType"; 

export default class Address {
    address: string;
    type: AddressType;
    balance: number;
    containsPending: boolean;

    label?: string;
    account?: number;
    diversifier?: number;
    receivers?: ReceiverType[];
  
    constructor(address: string, balance: number, type: AddressType, account?: number, diversifier?: number) {
      this.address = address;
      this.balance = balance;
      this.type = type;
      this.account = account;
      this.diversifier = diversifier;

      this.containsPending = false;
    }
  }