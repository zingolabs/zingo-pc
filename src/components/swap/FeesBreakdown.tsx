import React from "react";
import Modal from "react-modal";

import styles from "../history/History.module.css";
import swapStyles from "./Swap.module.css";
import cstyles from "../common/Common.module.css";
import { convertFeeToAsset, formatFeeAmount } from "../../swap";
import type { FeeConversionType, SwapRecordType } from "../../swap";
import { Field } from "./DetailField";

type FeesBreakdownProps = {
  record: SwapRecordType;
  modalIsOpen: boolean;
  closeModal: () => void;
};

/**
 * The per-fee breakdown behind the swap's headline total.
 *
 * Providers quote each fee in whatever asset they charge it in, so a swap can
 * carry fees in three different assets at once. Each row is expressed in the
 * receive asset where a price exists for both sides, and left in its own asset
 * where one does not: a converted figure without a price behind it would be a
 * guess wearing the clothes of a measurement.
 */
const FeesBreakdown: React.FC<FeesBreakdownProps> = ({ record, modalIsOpen, closeModal }) => {
  const receiveAssetId = record.receiveAsset.swapKitId;
  const receiveSymbol = record.receiveAsset.ticker ?? record.receiveAsset.chain ?? record.receiveAsset.symbol;
  const fees = record.feesRaw ?? [];

  const rows = fees.map((fee, index) => ({
    key: `${fee.type ?? "fee"}-${index}`,
    label: feeTypeLabel(fee.type),
    conversion: convertFeeToAsset({
      fee,
      targetAssetId: receiveAssetId,
      sellAssetId: record.sellAsset.swapKitId,
      receiveAssetId,
      fiatBasis: record.fiatValueBasis ?? null,
    }),
  }));

  return (
    <Modal
      isOpen={modalIsOpen}
      onRequestClose={closeModal}
      className={swapStyles.narrowmodal}
      overlayClassName={styles.txmodalOverlay}
    >
      <div className={cstyles.verticalflex} style={{ height: "100%" }}>
        <div className={`${cstyles.center} ${cstyles.xlarge} ${cstyles.padtopsmall}`}>Fee breakdown</div>

        <div style={{ overflowY: "auto", overflowX: "hidden", flexGrow: 1, marginTop: 15 }}>
          {rows.length === 0 && (
            <div className={`${cstyles.center} ${cstyles.margintoplarge}`}>This swap recorded no itemised fees.</div>
          )}
          {rows.map((row) => (
            <Field key={row.key} label={row.label} value={feeText(row.conversion, receiveSymbol)} />
          ))}

          {!!record.totalFeesInReceiveAsset && (
            <>
              <hr style={{ width: "100%" }} />
              <Field label="Total" value={`${formatFeeAmount(record.totalFeesInReceiveAsset)} ${receiveSymbol}`} />
            </>
          )}
        </div>

        <div className={`${cstyles.center} ${cstyles.margintoplarge}`}>
          <button type="button" className={cstyles.primarybutton} onClick={closeModal}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
};

/**
 * How one fee reads once converted. An unconvertible fee states its own asset
 * rather than a figure in the receive asset, so the reader can tell a measured
 * amount from an unavailable conversion.
 */
function feeText(conversion: FeeConversionType, receiveSymbol: string): string {
  switch (conversion.kind) {
    case "identity":
      return `${formatFeeAmount(conversion.amountInTarget)} ${receiveSymbol}`;
    // The original is the provider's own string, which for an ERC20 fee runs to
    // 18 decimals. It goes through the same formatter as the converted figure
    // so one line does not carry two precisions.
    case "converted":
      return `${formatFeeAmount(conversion.amountInTarget)} ${receiveSymbol} (${formatFeeAmount(conversion.originalAmount)} ${conversion.originalAsset})`;
    case "unconvertible":
      return `${formatFeeAmount(conversion.originalAmount)} ${conversion.originalAsset}`;
  }
}

/** SwapKit's fee types read as lowercase tokens; title-case them for display. */
function feeTypeLabel(type?: string): string {
  if (!type) return "Fee";
  return type.charAt(0).toUpperCase() + type.slice(1).replace(/[_-]/g, " ");
}

export default FeesBreakdown;
