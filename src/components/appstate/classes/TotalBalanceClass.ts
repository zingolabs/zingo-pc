export default class TotalBalanceClass {
  // Total transparent, confirmed and unconfirmed
  totalTransparentBalance: number;

  // Total private, confirmed + pending
  totalSaplingBalance: number;

  // Total orchard (legacy, frozen after NU6.3), confirmed + pending
  totalOrchardBalance: number;

  // Total ironwood (the NU6.3 shielded pool), confirmed + pending
  totalIronwoodBalance: number;

  // Total transparent, only confirmed
  confirmedTransparentBalance: number;

  // Total private, confirmed funds
  confirmedSaplingBalance: number;

  // Total orchard, confirmed funds
  confirmedOrchardBalance: number;

  // Total ironwood, confirmed funds
  confirmedIronwoodBalance: number;

  // Total spendable
  totalSpendableBalance: number;

  constructor() {
    this.totalTransparentBalance = 0;
    this.totalSaplingBalance = 0;
    this.totalOrchardBalance = 0;
    this.totalIronwoodBalance = 0;
    this.confirmedTransparentBalance = 0;
    this.confirmedSaplingBalance = 0;
    this.confirmedOrchardBalance = 0;
    this.confirmedIronwoodBalance = 0;
    this.totalSpendableBalance = 0;
  }

  // "All Funds" across every pool. Static because the balance in context is a
  // plain object literal (see RPC.fetchTotalBalance), not a class instance.
  static total(b: TotalBalanceClass): number {
    return b.totalOrchardBalance + b.totalIronwoodBalance + b.totalSaplingBalance + b.totalTransparentBalance;
  }

  static confirmedTotal(b: TotalBalanceClass): number {
    return (
      b.confirmedOrchardBalance + b.confirmedIronwoodBalance + b.confirmedSaplingBalance + b.confirmedTransparentBalance
    );
  }
}
