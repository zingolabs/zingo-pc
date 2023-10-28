import TxDetail from "./TxDetail";

// List of transactions. TODO: Handle memos, multiple addresses etc...
export default class Transaction {
  type: 'Sent' | 'Received' | 'SendToSelf'; // like kind
  fee?: number;
  confirmations: number | null;
  txid: string;
  time: number;
  zec_price?: number;
  txDetails: TxDetail[];

  constructor(type: 'Sent' | 'Received' | 'SendToSelf', confirmations: number, txid: string, time: number, txDetails: TxDetail[] ) {
    this.type = type;
    this.confirmations = confirmations;
    this.txid = txid;
    this.time = time;
    this.txDetails = txDetails;
  }
}
