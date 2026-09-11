import cstyles from "../common/Common.module.css";
import styles from "./BalanceBlock.module.css";
import Utils from "../../utils/utils";
import BalanceBlockProps from "./components/BalanceBlockProps";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

const BalanceBlock: React.FC<BalanceBlockProps> = ({
  zecValue,
  zecValueConfirmed,
  usdValue,
  usdValueConfirmed,
  topLabel,
  currencyName,
  tooltip,
}) => {
  const { bigPart, smallPart }: { bigPart: string; smallPart: string } = Utils.splitZecAmountIntoBigSmall(zecValue);
  const { bigPart: bigPartConfirmed, smallPart: smallPartConfirmed }: { bigPart: string; smallPart: string } =
    Utils.splitZecAmountIntoBigSmall(zecValueConfirmed ? zecValueConfirmed : 0);

  return (
    <div className={styles.block}>
      {topLabel && (
        <div className={cstyles.small}>
          {topLabel}
          {tooltip && (
            <FontAwesomeIcon
              icon={faInfoCircle}
              title={tooltip}
              style={{ marginLeft: 6, cursor: "help", opacity: 0.8 }}
            />
          )}
        </div>
      )}

      <div className={`${cstyles.highlight} ${cstyles.large}`}>
        <span>
          {currencyName} {bigPart}
        </span>
        <span className={`${cstyles.small} ${cstyles.zecsmallpart}`}>{smallPart}</span>
      </div>
      {currencyName === "ZEC" && <div className={`${cstyles.sublight} ${cstyles.small}`}>{usdValue}</div>}

      {zecValueConfirmed !== undefined && zecValue !== zecValueConfirmed && (
        <>
          <div className={cstyles.small}>{topLabel + " Confirmed"}</div>
          <div className={cstyles.horizontalflex}>
            <div className={`${cstyles.highlight} ${cstyles.small}`}>
              <span>
                {currencyName} {bigPartConfirmed}
              </span>
              <span className={`${cstyles.small} ${cstyles.zecsmallpart}`}>{smallPartConfirmed}</span>
            </div>
            {currencyName === "ZEC" && (
              <div style={{ marginLeft: 5 }} className={`${cstyles.sublight} ${cstyles.small}`}>
                {usdValueConfirmed}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default BalanceBlock;
