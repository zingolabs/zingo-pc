export default class ValueTransfer {
  type: 'sent' | 'received' | 'send-to-self' | 'memo-to-self' | 'shield';
  fee?: number;
  confirmations: number;
  txid: string;
  time: number;
  zec_price?: number;
  address: string;
  amount: number;
  memos?: string[];
  pool?: 'Orchard' | 'Sapling' | 'Transparent';


  constructor(
    type: 'sent' | 'received' | 'send-to-self' | 'memo-to-self' | 'shield', 
    confirmations: number, 
    txid: string, 
    time: number, 
    address: string,
    amount: number,  
   ) {
    this.type = type;
    this.confirmations = confirmations;
    this.txid = txid;
    this.time = time;
    this.address = address;
    this.amount = amount;
  }
}
