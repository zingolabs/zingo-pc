import type { FiatValueBasisType } from "./types/FiatValueBasisType";

/**
 * How a fee quoted in one asset was expressed in another.
 *
 * `identity` means no conversion was needed. `converted` carries both the
 * converted figure and the original, so the detail view can show what the
 * provider actually charged. `unconvertible` keeps only the original: without
 * a price for both sides, inventing a converted number would be a guess
 * presented as a fact.
 */
export type FeeConversionType =
  | { kind: "identity"; amountInTarget: number }
  | {
      kind: "converted";
      amountInTarget: number;
      originalAmount: string;
      originalAsset: string;
    }
  | {
      kind: "unconvertible";
      originalAmount: string;
      originalAsset: string;
    };

export function convertFeeToAsset(args: {
  fee: { amount?: string; asset?: string };
  targetAssetId: string;
  sellAssetId: string;
  receiveAssetId: string;
  fiatBasis: FiatValueBasisType | null;
}): FeeConversionType {
  const { fee, targetAssetId, sellAssetId, receiveAssetId, fiatBasis } = args;
  const amount = parseFloat(fee.amount ?? "0");
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const sourceAssetId = fee.asset ?? "";

  if (sourceAssetId === targetAssetId) {
    return { kind: "identity", amountInTarget: safeAmount };
  }

  // Bridge through USD. Only works when both the fee's own asset and the
  // target asset have a price in `fiatBasis`.
  const sourcePriceUsd =
    sourceAssetId === sellAssetId
      ? fiatBasis?.sellUsdUnitPrice
      : sourceAssetId === receiveAssetId
        ? fiatBasis?.receiveUsdUnitPrice
        : undefined;
  const targetPriceUsd =
    targetAssetId === sellAssetId
      ? fiatBasis?.sellUsdUnitPrice
      : targetAssetId === receiveAssetId
        ? fiatBasis?.receiveUsdUnitPrice
        : undefined;
  if (sourcePriceUsd !== undefined && sourcePriceUsd > 0 && targetPriceUsd !== undefined && targetPriceUsd > 0) {
    return {
      kind: "converted",
      amountInTarget: (safeAmount * sourcePriceUsd) / targetPriceUsd,
      originalAmount: fee.amount ?? "0",
      originalAsset: assetShortLabel(sourceAssetId),
    };
  }
  return {
    kind: "unconvertible",
    originalAmount: fee.amount ?? "0",
    originalAsset: assetShortLabel(sourceAssetId),
  };
}

/**
 * A fee amount at sane precision: at most 10 decimals, trailing zeros
 * trimmed, never scientific notation. Fees are sub-unit decimals in practice,
 * so integer formatting never arises. Empty and non-finite values read "0".
 */
export function formatFeeAmount(amount: number): string {
  if (!Number.isFinite(amount) || amount === 0) return "0";
  return amount.toFixed(10).replace(/0+$/, "").replace(/\.$/, "");
}

/**
 * The symbol out of a SwapKit asset id, whose shape is
 * `CHAIN.SYMBOL[-CONTRACT]`.
 */
export function assetShortLabel(asset: string): string {
  const afterDot = asset.includes(".") ? asset.slice(asset.indexOf(".") + 1) : asset;
  const dashIdx = afterDot.indexOf("-");
  return dashIdx >= 0 ? afterDot.slice(0, dashIdx) : afterDot;
}
