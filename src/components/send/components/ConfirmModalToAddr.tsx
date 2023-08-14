import Utils from "../../../utils/utils";
import { Info, ToAddr } from "../../appstate";
import styles from "../Send.module.css";
import cstyles from "../../common/Common.module.css";

type ConfirmModalToAddrProps = {
  toaddr: ToAddr;
  info: Info;
};

const ConfirmModalToAddr = ({ toaddr, info }: ConfirmModalToAddrProps) => {
  const { bigPart, smallPart }: {bigPart: string, smallPart: string} = Utils.splitZecAmountIntoBigSmall(toaddr.amount);

  const memo: string = toaddr.memo ? toaddr.memo : "";
  const memoReplyTo: string = toaddr.memoReplyTo ? toaddr.memoReplyTo : "";

  return (
    <div className={cstyles.well}>
      <div className={[cstyles.flexspacebetween, cstyles.margintopsmall].join(" ")}>
        <div className={[styles.confirmModalAddress].join(" ")}>
          <div className={[cstyles.verticalflex].join(" ")}>
            {toaddr.to.length < 80 ? toaddr.to : Utils.splitStringIntoChunks(toaddr.to, 3).map(item => <div key={item}>{item}</div>)}
          </div>
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
      <div className={[cstyles.sublight, cstyles.breakword, cstyles.memodiv].join(" ")}>{memo + memoReplyTo}</div>
    </div>
  );
};

export default ConfirmModalToAddr;