type BalanceBlockType = {
    zecValue: number;
    zecValueConfirmed?: number;
    usdValue: string;
    usdValueConfirmed?: string;
    currencyName: string;
    topLabel?: string;
    tooltip?: string;
  };

export default BalanceBlockType;