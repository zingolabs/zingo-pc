export default class ValueTransfer {
  type: 'sent' | 'received' | 'send-to-self' | 'memo-to-self' | 'shield' | 'rejection';
  fee?: number;
  confirmations: number;
  status: 'calculated' | 'transmitted' | 'mempool' |'confirmed';
  txid: string;
  time: number;
  zec_price?: number;
  address: string;
  amount: number;
  memos?: string[];
  pool?: 'Orchard' | 'Sapling' | 'Transparent';


  constructor(
    type: 'sent' | 'received' | 'send-to-self' | 'memo-to-self' | 'shield' | 'rejection',
    confirmations: number, 
    status: 'calculated' | 'transmitted' | 'mempool' |'confirmed',
    txid: string, 
    time: number, 
    address: string,
    amount: number,  
   ) {
    this.type = type;
    this.confirmations = confirmations;
    this.status = status;
    this.txid = txid;
    this.time = time;
    this.address = address;
    this.amount = amount;
  }
}
