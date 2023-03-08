export class TxDetail {
    address: string;
  
    amount: string;
  
    memo: string | null;
  
    constructor() {
      this.address = "";
      this.amount = "";
      this.memo = null;
    }
  }
  