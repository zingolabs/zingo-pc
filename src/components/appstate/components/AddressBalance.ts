import AddressType from "./AddressType";
import ReceiverType from "./ReceiverType";

export default class AddressBalance {
    address: string;
    balance: number;
    containsPending: boolean;
    label?: string;
    receivers?: ReceiverType[];
    type: AddressType;
  
    constructor(address: string, balance: number, type: AddressType) {
      this.address = address;
      this.balance = balance;
      this.containsPending = false;
      this.type = type;
    }
  }
  