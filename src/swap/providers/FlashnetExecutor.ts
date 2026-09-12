import { SwapKitProviderEnum } from "../enums/SwapKitProviderEnum";
import { DepositInstructionsType } from "../types/DepositInstructionsType";
import { FlashnetProviderData } from "../types/ProviderDataType";
import { SwapRecordType } from "../types/SwapRecordType";
import { TrackResponseType } from "../types/TrackResponseType";
import { ExtractDepositInstructionsContext, ProviderExecutor } from "./ProviderExecutor";
import { applyDefaultTrackUpdate } from "./trackUpdateBase";

/**
 * Provider executor for Flashnet swaps.
 *
 * Flashnet is one of the three providers SwapKit currently routes ZEC through
 * (verified via `/providers`.supportedChainIds). The first mainnet trace
 * arrived on 2026-09-11 and taught the one thing the documented schema does
 * not say: Flashnet recognises a deposit by the address that paid it. That
 * swap was paid straight out of the shielded pool, so the transaction
 * carried no transparent sender, and the order was refunded as
 * `deposit_source_mismatch` (ord_01a09310). Hence
 * `identifiesDepositBySender` below, which routes an outbound deposit
 * through the ZIP 320 address the quote named. The extraction itself is
 * from SwapKit's documented schema:
 *
 *   - `tx.to` / `inboundAddress` — deposit address the user funds.
 *   - `transient.swapId` — SwapKit-assigned identifier (prefixed `sk-`).
 *   - `tx.memo` — optional. Flashnet does not require a memo today but the
 *     field exists in SwapKit's schema; if a value is present we treat it the
 *     same way as Maya: UTF-8 bytes into OP_RETURN on the ZEC tx.
 *
 * If at execution time SwapKit returns a shape the executor cannot make sense
 * of, `extractDepositInstructions` throws with the missing field name so the
 * UI surfaces a clear error rather than persisting a half-built record.
 */
export class FlashnetExecutor implements ProviderExecutor {
  readonly provider = SwapKitProviderEnum.Flashnet;

  extractDepositInstructions(context: ExtractDepositInstructionsContext): DepositInstructionsType {
    const { swapResponse, sellAmountHumanDecimal } = context;
    const depositAddress = swapResponse.tx?.to ?? swapResponse.inboundAddress;
    if (!depositAddress) {
      throw new Error("FlashnetExecutor: SwapKit /v3/swap response missing deposit address (tx.to / inboundAddress).");
    }

    const memoText = swapResponse.tx?.memo;
    const swapKitAssignedId = swapResponse.transient?.swapId;
    const vaultAddress = swapResponse.inboundAddress !== depositAddress ? swapResponse.inboundAddress : undefined;

    const providerData: FlashnetProviderData = {
      kind: SwapKitProviderEnum.Flashnet,
      swapKitAssignedId,
      vaultAddress,
      memo: memoText,
    };

    return {
      provider: SwapKitProviderEnum.Flashnet,
      depositAddress,
      amountHumanDecimal: sellAmountHumanDecimal,
      memoBytes: memoText ? new TextEncoder().encode(memoText) : undefined,
      memoText,
      providerData,
      // Even with no memo to carry: the two-transaction shape is what gives
      // the deposit a transparent sender for Flashnet to match.
      identifiesDepositBySender: true,
    };
  }

  applyTrackUpdate(record: SwapRecordType, response: TrackResponseType): SwapRecordType {
    return applyDefaultTrackUpdate(record, response);
  }
}
