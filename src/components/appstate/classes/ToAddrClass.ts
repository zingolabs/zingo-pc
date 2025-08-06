export default class ToAddrClass {
    id?: number;
    to: string;
    amount: number;
    memo: string;
    memoReplyTo: string;
  
    constructor(id?: number) {
      this.id = id;
      this.to = "";
      this.amount = 0;
      this.memo = "";
      this.memoReplyTo = ""; 
    }
  }
  