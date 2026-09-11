import React from "react";
import { QRCodeSVG } from "qrcode.react";
import cstyles from "../common/Common.module.css";
import styles from "./Swap.module.css";
import {
  buildDepositQr,
  exactAmountWarningText,
  isEvmSourceChain,
  memoFieldHintForChain,
  memoToHexCalldata,
  providerRequiresMemo,
  requiresExactAmountWarning,
} from "../../swap";
import type { SwapAssetType, SwapDirectionEnum, SwapKitProviderEnum } from "../../swap";
import { CopyField, Field, FieldRow } from "../common/DetailField";

/**
 * Everything a user needs in order to pay a swap's deposit from outside this
 * wallet: a QR that carries as much of it as the chain can express, the same
 * values as copyable rows underneath, and the two warnings that decide whether
 * the deposit is routed or refunded.
 *
 * Shared between the post-commit slip in `SwapExecute` and the detail view the
 * user reopens after closing it, because a deposit that is not paid in one
 * sitting is the normal case for inbound: the user has to go find their other
 * wallet. Both surfaces must say exactly the same thing about where the memo
 * goes — that is the field a mismatch costs money on.
 */
export type DepositSlipProps = {
  provider: SwapKitProviderEnum;
  direction: SwapDirectionEnum;
  /** The asset the user is paying WITH — the one whose chain rules apply. */
  sellAsset: SwapAssetType;
  depositAddress: string;
  amountHumanDecimal: string;
  memoText?: string;
  /** Route expiry, when the quote carried one. */
  expiresAtMs?: number;
  /**
   * Suppresses the QR. Set once this wallet has broadcast the deposit itself:
   * there is nothing left to scan, and offering a payment code for an already
   * paid deposit invites paying it twice.
   */
  paid?: boolean;
  /**
   * Fields to open the compact row with. The caller owns them because what
   * belongs beside the amount differs by surface: the execute screen has a
   * provider to name, the detail view already names it further up.
   */
  leadingFields?: React.ReactNode;
  copy: (value: string) => void;
};

const DepositSlip: React.FC<DepositSlipProps> = ({
  provider,
  direction,
  sellAsset,
  depositAddress,
  amountHumanDecimal,
  memoText,
  expiresAtMs,
  paid,
  leadingFields,
  copy,
}) => {
  const qr = paid ? null : buildDepositQr({ sellAsset, depositAddress, amountHumanDecimal, memoText });
  const showMemoHint = !!memoText && providerRequiresMemo(provider);
  const showExactAmount = requiresExactAmountWarning({ direction, provider });
  const amountTicker = sellAsset.ticker ?? sellAsset.symbol;

  return (
    <>
      {qr && (
        <div className={styles.qrblock}>
          {/* SVG rather than the canvas the Receive screen uses: that one is
              canvas because it exports a PNG, this one is only ever looked at
              and scanned, and vector keeps it crisp at any window scale. */}
          <div className={styles.qrframe}>
            <QRCodeSVG value={qr.value} size={180} level="M" marginSize={0} />
          </div>
          <div className={`${cstyles.sublight} ${cstyles.small} ${cstyles.center}`}>{qr.hint}</div>
        </div>
      )}

      <FieldRow>
        {leadingFields}
        <CopyField label="Exact amount" value={`${amountHumanDecimal} ${amountTicker}`} copy={copy} />
        {!!expiresAtMs && (
          <Field
            label="Send before"
            value={
              <>
                {new Date(expiresAtMs).toLocaleString()}
                {/* Kept in the column with the deadline it qualifies, rather
                    than as a loose line under the row belonging to nothing.
                    Measured, because a sentence this long left unconstrained
                    is the widest thing in the row and squashes the two fields
                    beside it into a corner. */}
                <div className={`${cstyles.sublight} ${cstyles.small}`} style={{ maxWidth: 260 }}>
                  After this the provider may reprice the route. A late deposit is refunded rather than lost.
                </div>
              </>
            }
          />
        )}
      </FieldRow>
      {showExactAmount && <div className={styles.warningbanner}>{exactAmountWarningText(sellAsset.chain)}</div>}

      <CopyField label="Deposit address" value={depositAddress} copy={copy} />

      {!!memoText && (
        <>
          <CopyField label="Memo" value={memoText} copy={copy} />
          {/* EVM wallets take the memo as a 0x hex blob in the data field, never
              as the raw string. Pre-encoding it here removes the manual ASCII →
              hex step that lost a deposit on 2026-06-27. */}
          {isEvmSourceChain(sellAsset.chain) && (
            <CopyField label="Memo (hex calldata)" value={memoToHexCalldata(memoText)} copy={copy} />
          )}
          {showMemoHint && <div className={styles.warningbanner}>{memoFieldHintForChain(sellAsset.chain)}</div>}
        </>
      )}
    </>
  );
};

export default DepositSlip;
