import React from "react";
import dateformat from "dateformat";
import styles from "../History.module.css";
import cstyles from "../../common/Common.module.css";
import { ValueTransferClass, ValueTransferKindEnum, ValueTransferStatusEnum } from "../../appstate";
import Utils from "../../../utils/utils";

type VtItemBlockProps = {
  index: number;
  vt: ValueTransferClass;
  setValueTransferDetail: (t: ValueTransferClass) => void;
  setValueTransferDetailIndex: (i: number) => void;
  setModalIsOpen: (b: boolean) => void;
  currencyName: string;
  addressBookMap: Map<string, string>;
  previousLineWithSameTxid: boolean;
};

const VtItemBlock: React.FC<VtItemBlockProps> = ({
  index,
  vt,
  setValueTransferDetail,
  setValueTransferDetailIndex,
  setModalIsOpen,
  currencyName,
  addressBookMap,
  previousLineWithSameTxid,
}) => {
  const txDate: Date = new Date(vt.time * 1000);
  const datePart: string = dateformat(txDate, "mmm dd, yyyy");
  const timePart: string = dateformat(txDate, "hh:MM tt");

  const fees: number = vt && vt.fee ? vt.fee : 0;
  const amount: number = vt.amount;
  const label: string | undefined = vt.address ? addressBookMap.get(vt.address) : undefined;
  const address: string | undefined = vt.address;
  const txid: string = vt.txid;
  const memos: string = vt.memos && vt.memos.length > 0 && !!vt.memos.join("") ? vt.memos.join("\n") : "";

  const { bigPart, smallPart }: { bigPart: string; smallPart: string } = Utils.splitZecAmountIntoBigSmall(amount);

  // The transaction's converted USD value (`price * amount`) uses the price
  // recorded AT tx time, never the current price: today's price on a years-old
  // amount is meaningless. A tx with no recorded price (e.g. older value
  // transfers from before zingolib recorded per-tx prices) renders `USD --`
  // rather than a wrong figure.
  const price: number = vt.zec_price || 0;
  const priceString: string = currencyName === "ZEC" ? Utils.getZecToUsdString(price, amount) : "";

  //if (index === 0) {
  //  vt.status = ValueTransferStatusEnum.failed;
  //  vt.confirmations = 0;
  //}

  //if (index === 2) {
  //  vt.status = ValueTransferStatusEnum.failed;
  //  vt.type = ValueTransferKindEnum.shield;
  //  vt.confirmations = 0;
  //}

  return (
    <div>
      {!previousLineWithSameTxid ? (
        <div className={`${cstyles.small} ${cstyles.sublight} ${styles.txdate}`}>{datePart}</div>
      ) : (
        <div style={{ marginLeft: 25, marginRight: 25, height: 1, background: "white", opacity: 0.4 }}></div>
      )}
      <div
        role="button"
        tabIndex={0}
        className={`${cstyles.well} ${styles.txbox}`}
        onClick={() => {
          setValueTransferDetail(vt);
          setValueTransferDetailIndex(index);
          setModalIsOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setValueTransferDetail(vt);
            setValueTransferDetailIndex(index);
            setModalIsOpen(true);
          }
        }}
      >
        <div className={styles.txtype} style={{ marginRight: 10 }}>
          <div
            style={{
              color:
                vt.confirmations === 0
                  ? Utils.getCssVariable("--color-primary-disable")
                  : vt.type === ValueTransferKindEnum.received ||
                      vt.type === ValueTransferKindEnum.shield ||
                      vt.type === ValueTransferKindEnum.migration
                    ? Utils.getCssVariable("--color-primary")
                    : Utils.getCssVariable("--color-text"),
            }}
          >
            {Utils.VTTypeWithConfirmations(vt.type, vt.status, vt.confirmations)}
          </div>
          <div className={`${cstyles.padtopsmall} ${cstyles.sublight}`}>{timePart}</div>
          {(vt.status === ValueTransferStatusEnum.calculated ||
            vt.status === ValueTransferStatusEnum.transmitted ||
            vt.status === ValueTransferStatusEnum.mempool ||
            vt.status === ValueTransferStatusEnum.failed) && (
            <div
              style={{
                color:
                  vt.status === ValueTransferStatusEnum.failed
                    ? Utils.getCssVariable("--color-error")
                    : vt.status === ValueTransferStatusEnum.calculated ||
                        vt.status === ValueTransferStatusEnum.transmitted
                      ? Utils.getCssVariable("--color-warning")
                      : Utils.getCssVariable("--color-primary-disable"),
              }}
            >
              {vt.status === ValueTransferStatusEnum.calculated
                ? "Calculated"
                : vt.status === ValueTransferStatusEnum.transmitted
                  ? "Transmitted"
                  : vt.status === ValueTransferStatusEnum.mempool
                    ? "In Mempool"
                    : vt.status === ValueTransferStatusEnum.failed
                      ? "Failed"
                      : ""}
            </div>
          )}
        </div>
        <div className={styles.txaddressmemofeeamount}>
          <div className={styles.txaddressmemo}>
            <div className={styles.txaddress}>
              {!!label && (
                <div className={cstyles.highlight} style={{ marginBottom: 5 }}>
                  {label}
                </div>
              )}
              {/* The whole list row (txbox above) is already clickable and opens
                  VtModal, which shows the full address/txid and offers copy
                  there. So this is display-only — no click-to-copy here. */}
              <div style={{ display: "flex", flexDirection: "column", flexWrap: "wrap" }}>
                {address ? Utils.trimToSmall(address, 10) : txid ? Utils.trimToSmall(txid, 10) : "-"}
              </div>
            </div>
            <div
              className={[cstyles.small, cstyles.sublight, cstyles.padtopsmall, cstyles.memodiv, styles.txmemo].join(
                " ",
              )}
            >
              {memos ? memos : null}
            </div>
          </div>
          <div className={`${styles.txfeeamount} ${cstyles.right}`}>
            {fees > 0 && (
              <div className={`${styles.txfee} ${cstyles.right}`}>
                <div>Transaction Fee</div>
                <div className={`${cstyles.small} ${cstyles.padtopsmall}`}>
                  <div>ZEC {Utils.maxPrecisionTrimmed(fees)}</div>
                  {currencyName === "ZEC" && (
                    <div className={cstyles.sublight}>{Utils.getZecToUsdString(price, fees)}</div>
                  )}
                </div>
              </div>
            )}
            <div className={`${styles.txamount} ${cstyles.right} ${cstyles.padtopsmall}`}>
              <div className={cstyles.padtopsmall}>
                <span
                  style={{
                    color:
                      vt.status === ValueTransferStatusEnum.failed ? Utils.getCssVariable("--color-error") : undefined,
                  }}
                >
                  {currencyName} {bigPart}
                </span>
                <span
                  style={{
                    color:
                      vt.status === ValueTransferStatusEnum.failed ? Utils.getCssVariable("--color-error") : undefined,
                  }}
                  className={`${cstyles.small} ${cstyles.zecsmallpart}`}
                >
                  {smallPart}
                </span>
              </div>
              <div
                style={{
                  color:
                    vt.status === ValueTransferStatusEnum.failed ? Utils.getCssVariable("--color-error") : undefined,
                }}
                className={`${cstyles.sublight} ${cstyles.small} ${cstyles.padtopsmall}`}
              >
                {priceString}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(VtItemBlock);
