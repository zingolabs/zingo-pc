export default class TxDetail {
  address: string;
  amount: number;
  memos?: string[];
  pool?: 'Orchard' | 'Sapling' | 'Transparent';
  
  constructor(address: string, amount: number) {
    this.address = address;
    this.amount = amount;
  }
}
  