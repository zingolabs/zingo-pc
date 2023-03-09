export default class AddressBalance {
    address: string;
  
    balance: number;
  
    containsPending: boolean;
    label?: string;
  
    receivers?: string;
  
    constructor(address: string, balance: number) {
      this.address = address;
      this.balance = balance;
      this.containsPending = false;
    }
  }
  