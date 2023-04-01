import AddressType from "./AddressType";

export default class AddressBalance {
    address: string;
  
    balance: number;
  
    containsPending: boolean;
    label?: string;
  
    receivers?: string;

    type: AddressType;
  
    constructor(address: string, balance: number, type: AddressType) {
      this.address = address;
      this.balance = balance;
      this.containsPending = false;
      this.type = type;
    }
  }
  