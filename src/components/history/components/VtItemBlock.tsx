import React from "react";
import dateformat from "dateformat";
import styles from "../History.module.css";
import cstyles from "../../common/Common.module.css";
import { ValueTransferClass, ValueTransferKindEnum, ValueTransferStatusEnum } from "../../appstate";
import Utils from "../../../utils/utils";
import { swapRowLabel } from "../../../swap";

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
  // A swap row is denominated in the counterparty asset, so it carries its own
  // unit and its own price. Pricing a BTC amount at the ZEC rate would not be
  // an empty column, it would be a wrong number.
  const isSwapRow: boolean = vt.type === ValueTransferKindEnum.swap;
  const amountUnit: string = isSwapRow ? (vt.swapAssetTicker ?? "") : currencyName;
  const priceString: string = isSwapRow
    ? Utils.getZecToUsdString(vt.swapUsdUnitPrice ?? 0, amount)
    : currencyName === "ZEC"
      ? Utils.getZecToUsdString(price, amount)
      : "";

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
                  ? "var(--color-primary-disable)"
                  : vt.type === ValueTransferKindEnum.received ||
                      vt.type === ValueTransferKindEnum.shield ||
                      vt.type === ValueTransferKindEnum.migration ||
                      (vt.type === ValueTransferKindEnum.swap && vt.swapIsInbound)
                    ? "var(--color-primary)"
                    : "var(--color-text)",
            }}
          >
            {vt.type === ValueTransferKindEnum.swap
              ? swapRowLabel(vt.swapStatus)
              : Utils.VTTypeWithConfirmations(vt.type, vt.status, vt.confirmations)}
          </div>
          <div className={`${cstyles.padtopsmall} ${cstyles.sublight}`}>{timePart}</div>
          {/* Not on a swap row. Calculated, Transmitted and In Mempool describe
              where a Zcash transaction sits on its way into a block, which a
              swap is not doing: it is waiting on a deposit, or on a provider
              moving funds across chains. Its own state is already the label
              above, and `swapRowLabel` covers every one of them, so this line
              could only restate it in the wrong vocabulary. The mapped status
              still colours the amount, which is why the mapping stays. */}
          {!isSwapRow &&
            (vt.status === ValueTransferStatusEnum.calculated ||
              vt.status === ValueTransferStatusEnum.transmitted ||
              vt.status === ValueTransferStatusEnum.mempool ||
              vt.status === ValueTransferStatusEnum.failed) && (
              <div
                style={{
                  color:
                    vt.status === ValueTransferStatusEnum.failed
                      ? "var(--color-error)"
                      : vt.status === ValueTransferStatusEnum.calculated ||
                          vt.status === ValueTransferStatusEnum.transmitted
                        ? "var(--color-warning)"
                        : "var(--color-primary-disable)",
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
              <div className={cstyles.right}>
                <div>Transaction Fee</div>
                <div className={`${cstyles.small} ${cstyles.padtopsmall}`}>
                  <div>ZEC {Utils.maxPrecisionTrimmed(fees)}</div>
                  {currencyName === "ZEC" && (
                    <div className={cstyles.sublight}>{Utils.getZecToUsdString(price, fees)}</div>
                  )}
                </div>
              </div>
            )}
            <div className={cstyles.right}>
              <div className={cstyles.padtopsmall}>
                <span
                  style={{
                    color: vt.status === ValueTransferStatusEnum.failed ? "var(--color-error)" : undefined,
                  }}
                >
                  {amountUnit} {bigPart}
                </span>
                <span
                  style={{
                    color: vt.status === ValueTransferStatusEnum.failed ? "var(--color-error)" : undefined,
                  }}
                  className={`${cstyles.small} ${cstyles.zecsmallpart}`}
                >
                  {smallPart}
                </span>
              </div>
              <div
                style={{
                  color: vt.status === ValueTransferStatusEnum.failed ? "var(--color-error)" : undefined,
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
