export default class TotalBalance {
    // Total t address, confirmed and spendable
    transparent: number;
  
    // Total orchard balance
    uabalance: number;
  
    // Total private, confirmed + unconfirmed
    zbalance: number;
  
    // Total private, confirmed funds that have been verified
    verifiedZ: number;
  
    // Total private that are waiting for confirmation
    unverifiedZ: number;
  
    // Total private funds that are spendable
    spendableZ: number;
  
    // Total unconfirmed + spendable
    total: number;
  
    constructor() {
      this.uabalance = 0;
      this.zbalance = 0;
      this.transparent = 0;
      this.verifiedZ = 0;
      this.unverifiedZ = 0;
      this.spendableZ = 0;
      this.total = 0;
    }
  }