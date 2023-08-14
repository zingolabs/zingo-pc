export default class TotalBalance {
    // Total t address, confirmed and spendable
    transparent: number;
  
    // Total orchard balance
    obalance: number;

    // Total orchard, confirmed funds that have been verified
    verifiedO: number;
  
    // Total orchard that are waiting for confirmation
    unverifiedO: number;
  
    // Total orchard funds that are spendable
    spendableO: number;
  
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
      this.obalance = 0;
      this.zbalance = 0;
      this.transparent = 0;
      this.verifiedO = 0;
      this.unverifiedO = 0;
      this.spendableO = 0;
      this.verifiedZ = 0;
      this.unverifiedZ = 0;
      this.spendableZ = 0;
      this.total = 0;
    }
  }