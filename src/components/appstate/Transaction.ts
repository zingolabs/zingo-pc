import { TxDetail } from "./TxDetail";

// List of transactions. TODO: Handle memos, multiple addresses etc...
export default class Transaction {
    type: string;
    address: string;
    amount: number;
    position: string;
    confirmations: number;
    txid: string;
    time: number;
    detailedTxns: TxDetail[];
    zecPrice: any;
  
    constructor() {
      this.type = "";
      this.address = "";
      this.amount = 0;
      this.position = "";
      this.confirmations = 0;
      this.txid = "";
      this.time = 0;
      this.detailedTxns = [];
    }
  }
