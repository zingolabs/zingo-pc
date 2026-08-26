import React from "react";
import { QRCodeSVG } from "qrcode.react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy, faExternalLinkAlt } from "@fortawesome/free-solid-svg-icons";

import cstyles from "../common/Common.module.css";
import styles from "./Swap.module.css";
import { shell } from "../../electronBridge";
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
          {qr.openable && (
            <button type="button" className={cstyles.primarybutton} onClick={() => shell.openExternal(qr.value)}>
              Open in a wallet &nbsp;
              <FontAwesomeIcon icon={faExternalLinkAlt} />
            </button>
          )}
        </div>
      )}

      <CopyRow label="Deposit address" value={depositAddress} copy={copy} />

      <CopyRow label="Exact amount" value={`${amountHumanDecimal} ${amountTicker}`} copy={copy} />
      {showExactAmount && <div className={styles.warningbanner}>{exactAmountWarningText(sellAsset.chain)}</div>}

      {!!memoText && (
        <>
          <CopyRow label="Memo" value={memoText} copy={copy} />
          {/* EVM wallets take the memo as a 0x hex blob in the data field, never
              as the raw string. Pre-encoding it here removes the manual ASCII →
              hex step that lost a deposit on 2026-06-27. */}
          {isEvmSourceChain(sellAsset.chain) && (
            <CopyRow label="Memo (hex calldata)" value={memoToHexCalldata(memoText)} copy={copy} />
          )}
          {showMemoHint && <div className={styles.warningbanner}>{memoFieldHintForChain(sellAsset.chain)}</div>}
        </>
      )}

      {!!expiresAtMs && (
        <div className={cstyles.padtopsmall}>
          <div className={`${cstyles.sublight} ${cstyles.small}`}>Send before</div>
          <div>{new Date(expiresAtMs).toLocaleString()}</div>
          <div className={`${cstyles.sublight} ${cstyles.small}`}>
            After this the provider may reprice the route. A late deposit is refunded rather than lost.
          </div>
        </div>
      )}
    </>
  );
};

/**
 * A labelled value with a copy button. Every row on this slip is something the
 * user retypes into another wallet, so none of them are display-only.
 */
function CopyRow({ label, value, copy }: { label: string; value: string; copy: (value: string) => void }) {
  return (
    <div className={cstyles.padtopsmall}>
      <div className={`${cstyles.sublight} ${cstyles.small}`}>{label}</div>
      <div className={cstyles.horizontalflex} style={{ alignItems: "center", gap: 8 }}>
        <div style={{ wordBreak: "break-all" }}>{value}</div>
        <button
          type="button"
          aria-label={`Copy ${label}`}
          style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0 }}
          onClick={() => copy(value)}
        >
          <FontAwesomeIcon icon={faCopy} />
        </button>
      </div>
    </div>
  );
}

export default DepositSlip;
