import cstyles from "../common/Common.module.css";
import Utils from "../../utils/utils";
import BalanceBlockProps from "./components/BalanceBlockProps";

const BalanceBlock: React.FC<BalanceBlockProps> = ({ 
  zecValue, 
  zecValueConfirmed,
  usdValue, 
  usdValueConfirmed,
  topLabel, 
  currencyName,
}) => {
  const { bigPart, smallPart }: {bigPart: string, smallPart: string} = 
    Utils.splitZecAmountIntoBigSmall(zecValue);
  const { bigPart: bigPartConfirmed, smallPart: smallPartConfirmed }: {bigPart: string, smallPart: string} = 
    Utils.splitZecAmountIntoBigSmall(zecValueConfirmed ? zecValueConfirmed : 0);

  return (
    <div className={cstyles.padall}>
      {topLabel && (
        <div className={[cstyles.small].join(" ")}>{topLabel}</div>
      )}

      <div className={[cstyles.highlight, cstyles.large].join(" ")}>
        <span>
          {currencyName} {bigPart}
        </span>
        <span className={[cstyles.small, cstyles.zecsmallpart].join(" ")}>{smallPart}</span>
      </div>
      <div className={[cstyles.sublight, cstyles.small].join(" ")}>{usdValue}</div>

      {zecValueConfirmed !== undefined && zecValue !== zecValueConfirmed && (
        <>
          <div className={[cstyles.small].join(" ")}>{topLabel + ' Confirmed'}</div>
          <div className={cstyles.horizontalflex}>
            <div className={[cstyles.highlight, cstyles.small].join(" ")}>
              <span>
                {currencyName} {bigPartConfirmed}
              </span>
              <span className={[cstyles.small, cstyles.zecsmallpart].join(" ")}>{smallPartConfirmed}</span>
            </div>
            <div style={{ marginLeft: 5 }} className={[cstyles.sublight, cstyles.small].join(" ")}>{usdValueConfirmed}</div>
          </div>
        </>
      )}
    </div>
  );
};

export default BalanceBlock;