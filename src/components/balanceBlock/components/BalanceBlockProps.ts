import { ValueTransferStatusEnum } from "../../appstate";

type BalanceBlockProps = {
  zecValue: number;
  zecValueConfirmed?: number;
  usdValue: string;
  usdValueConfirmed?: string;
  currencyName: string;
  status?: ValueTransferStatusEnum | "";
  topLabel?: string;
  tooltip?: string;
};

export default BalanceBlockProps;
