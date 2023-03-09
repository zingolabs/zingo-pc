import Utils from "../../../utils/utils";
import { Info, ToAddr } from "../../appstate";
import styles from "../Send.module.css";
import cstyles from "../../common/Common.module.css";

type ConfirmModalToAddrProps = {
  toaddr: ToAddr;
  info: Info;
};

const ConfirmModalToAddr = ({ toaddr, info }: ConfirmModalToAddrProps) => {
  const { bigPart, smallPart } = Utils.splitZecAmountIntoBigSmall(toaddr.amount);

  const memo: string = toaddr.memo ? toaddr.memo : "";

  return (
    <div className={cstyles.well}>
      <div className={[cstyles.flexspacebetween, cstyles.margintopsmall].join(" ")}>
        <div className={[styles.confirmModalAddress].join(" ")}>
          {Utils.splitStringIntoChunks(toaddr.to, 6).join(" ")}
        </div>
        <div className={[cstyles.verticalflex, cstyles.right].join(" ")}>
          <div className={cstyles.large}>
            <div>
              <span>
                {info.currencyName} {bigPart}
              </span>
              <span className={[cstyles.small, styles.zecsmallpart].join(" ")}>{smallPart}</span>
            </div>
          </div>
          <div>{Utils.getZecToUsdString(info.zecPrice, toaddr.amount)}</div>
        </div>
      </div>
      <div className={[cstyles.sublight, cstyles.breakword, cstyles.memodiv].join(" ")}>{memo}</div>
    </div>
  );
};

export default ConfirmModalToAddr;