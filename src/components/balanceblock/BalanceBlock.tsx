import cstyles from "../common/Common.module.css";
import Utils from "../../utils/utils";
import BalanceBlockType from "./components/BalanceBlockType";

const BalanceBlock: React.FC<BalanceBlockType> = ({ zecValue, usdValue, topLabel, currencyName }) => {
  const { bigPart, smallPart }: {bigPart: string, smallPart: string} = Utils.splitZecAmountIntoBigSmall(zecValue);

  return (
    <div className={cstyles.padall}>
      <div className={[cstyles.small].join(" ")}>{topLabel}</div>
      <div className={[cstyles.highlight, cstyles.large].join(" ")}>
        <span>
          {currencyName} {bigPart}
        </span>
        <span className={[cstyles.small, cstyles.zecsmallpart].join(" ")}>{smallPart}</span>
      </div>
      <div className={[cstyles.sublight, cstyles.small].join(" ")}>{usdValue}</div>
    </div>
  );
};

export default BalanceBlock;