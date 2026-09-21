import type { ValueTransferClass } from "../appstate";
import type { SwapRecordType } from "../../swap";

/**
 * Everything a history row can be searched by, as one string.
 *
 * The filter used to read five fields — address, contact name, transaction id,
 * kind and memos — which is what a row shows and not what a row is. Someone
 * looking for "the one for 0.0042" or "the one to Flashnet" or the swap whose
 * order id a support thread quotes found nothing, and had no way to tell that
 * from the wallet not holding it.
 *
 * So a row offers its amounts and every code it carries. Amounts go in twice,
 * as written and padded to eight decimals, because a wallet holds `0.005` and
 * the user types what the row shows them, `0.00500000` — and either way a
 * prefix of the other.
 *
 * A swap row adds the record behind it: both assets, every amount the swap has
 * a figure for, the provider, the addresses it passed through and the hash of
 * each leg. The ZEC side of a swap is already in the wallet's own transfers;
 * the rest of it exists nowhere else.
 */

/** A number as both the wallet writes it and as a row shows it. */
function amountForms(amount: number | undefined): string {
  if (amount === undefined || amount === null || Number.isNaN(amount)) return "";
  return `${amount} ${amount.toFixed(8)}`;
}

export function valueTransferSearchText(vt: ValueTransferClass, contactLabel?: string): string {
  return [
    vt.address ?? "",
    contactLabel ?? "",
    vt.txid ?? "",
    vt.type ?? "",
    vt.status ?? "",
    vt.swapAssetTicker ?? "",
    amountForms(vt.amount),
    amountForms(vt.fee),
    ...(vt.memos ?? []),
  ].join(" ");
}

export function swapRecordSearchText(record: SwapRecordType): string {
  const assets = [record.sellAsset, record.receiveAsset].flatMap((asset) =>
    asset ? [asset.ticker ?? "", asset.symbol ?? "", asset.chain ?? ""] : [],
  );

  return [
    record.provider ?? "",
    record.direction ?? "",
    record.status ?? "",
    ...assets,
    record.sellAmountHumanDecimal ?? "",
    record.expectedReceiveAmount ?? "",
    record.actualReceiveAmount ?? "",
    record.minReceiveAmount ?? "",
    record.totalFeesInReceiveAsset ?? "",
    record.routeId ?? "",
    record.providerOrderId ?? "",
    record.swapKitInternalId ?? "",
    record.depositAddress ?? "",
    record.sourceAddress ?? "",
    record.destinationAddress ?? "",
    record.broadcast?.txId ?? "",
    ...(record.broadcast?.allTxIds ?? []),
    record.observedDepositTxHash ?? "",
    record.destinationTxHash ?? "",
    ...(record.intermediateLegs ?? []).map((leg) => leg.hash ?? ""),
    record.refundInfo?.refundTxHash ?? "",
    record.refundInfo?.refundReason ?? "",
    record.failureReason ?? "",
  ].join(" ");
}
