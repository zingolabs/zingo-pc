import AddressType from "./AddressType";
import ReceiverType from "./ReceiverType"; 

export default class Address {
    address: string;
    type: AddressType;
    balance: number;
    containsPending: boolean;

    receivers?: ReceiverType[];
  
    constructor(address: string, balance: number, type: AddressType) {
      this.address = address;
      this.balance = balance;
      this.type = type;

      this.containsPending = false;
    }
  }