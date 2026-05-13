import Utils from "../../../utils/utils";
import { InfoClass, ToAddrClass } from "../../appstate";
import styles from "../Send.module.css";
import cstyles from "../../common/Common.module.css";

type SendConfirmModalToAddrProps = {
  toaddr: ToAddrClass;
  info: InfoClass;
};

const SendConfirmModalToAddr = ({ toaddr, info }: SendConfirmModalToAddrProps) => {
  const { bigPart, smallPart }: { bigPart: string; smallPart: string } = Utils.splitZecAmountIntoBigSmall(
    toaddr.amount,
  );

  const memo: string = toaddr.memo ? toaddr.memo : "";
  const memoReplyTo: string = toaddr.memoReplyTo ? toaddr.memoReplyTo : "";

  return (
    <div className={cstyles.well}>
      <div className={`${cstyles.flexspacebetween} ${cstyles.margintopsmall}`}>
        <div className={styles.confirmModalAddress}>
          <div className={cstyles.verticalflex}>
            {toaddr.to.length < 80
              ? toaddr.to
              : Utils.splitStringIntoChunks(toaddr.to, 3).map((item) => <div key={item}>{item}</div>)}
          </div>
        </div>
        <div className={`${cstyles.verticalflex} ${cstyles.right}`}>
          <div className={cstyles.large}>
            <div>
              <span>
                {info.currencyName} {bigPart}
              </span>
              <span className={`${cstyles.small} ${styles.zecsmallpart}`}>{smallPart}</span>
            </div>
          </div>
          {info.currencyName === "ZEC" && <div>{Utils.getZecToUsdString(info.zecPrice, toaddr.amount)}</div>}
        </div>
      </div>
      <div className={`${cstyles.sublight} ${cstyles.breakword} ${cstyles.memodiv}`}>{memo + memoReplyTo}</div>
    </div>
  );
};

export default SendConfirmModalToAddr;
