import cstyles from "../common/Common.module.css";
import Utils from "../../utils/utils";
import BalanceBlockProps from "./components/BalanceBlockProps";
import { ValueTransferStatusEnum } from "../appstate";

const BalanceBlockHighlight: React.FC<BalanceBlockProps> = ({
  zecValue,
  zecValueConfirmed,
  usdValue,
  usdValueConfirmed,
  currencyName,
  status,
  topLabel,
  tooltip,
}) => {
  const { bigPart, smallPart }: { bigPart: string; smallPart: string } = Utils.splitZecAmountIntoBigSmall(zecValue);
  const { bigPart: bigPartConfirmed, smallPart: smallPartConfirmed }: { bigPart: string; smallPart: string } =
    Utils.splitZecAmountIntoBigSmall(zecValueConfirmed ? zecValueConfirmed : 0);

  return (
    <div style={{ padding: "1em" }} title={tooltip}>
      {topLabel && (
        <div className={cstyles.small}>
          {topLabel}
          {tooltip && (
            <span>
              &nbsp;
              <i className={`${cstyles.green} ${"fas"} ${"fa-info-circle"}`} />
            </span>
          )}
        </div>
      )}

      <div className={`${cstyles.highlight} ${cstyles.xlarge}`}>
        <span
          style={{
            color: status === ValueTransferStatusEnum.failed ? Utils.getCssVariable("--color-error") : undefined,
          }}
        >
          {currencyName} {bigPart}
        </span>
        <span
          style={{
            color: status === ValueTransferStatusEnum.failed ? Utils.getCssVariable("--color-error") : undefined,
          }}
          className={`${cstyles.small} ${cstyles.zecsmallpart}`}
        >
          {smallPart}
        </span>
      </div>
      {currencyName === "ZEC" && (
        <div
          style={{
            color: status === ValueTransferStatusEnum.failed ? Utils.getCssVariable("--color-error") : undefined,
          }}
          className={`${cstyles.sublight} ${cstyles.small}`}
        >
          {usdValue}
        </div>
      )}

      {zecValueConfirmed !== undefined && zecValue !== zecValueConfirmed && (
        <>
          <div className={cstyles.small}>{topLabel + " Confirmed"}</div>
          <div className={cstyles.horizontalflex}>
            <div className={`${cstyles.highlight} ${cstyles.small}`}>
              <span
                style={{
                  color: status === ValueTransferStatusEnum.failed ? Utils.getCssVariable("--color-error") : undefined,
                }}
              >
                {currencyName} {bigPartConfirmed}
              </span>
              <span
                style={{
                  color: status === ValueTransferStatusEnum.failed ? Utils.getCssVariable("--color-error") : undefined,
                }}
                className={`${cstyles.small} ${cstyles.zecsmallpart}`}
              >
                {smallPartConfirmed}
              </span>
            </div>
            {currencyName === "ZEC" && (
              <div
                style={{
                  color: status === ValueTransferStatusEnum.failed ? Utils.getCssVariable("--color-error") : undefined,
                  marginLeft: 5,
                }}
                className={`${cstyles.sublight} ${cstyles.small}`}
              >
                {usdValueConfirmed}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default BalanceBlockHighlight;
