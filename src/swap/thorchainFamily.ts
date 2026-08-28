import { SwapKitProviderEnum } from "./enums/SwapKitProviderEnum";

/**
 * Whether a provider is THORChain or the Mayachain fork of it, in either the
 * streaming or the single-shot form.
 *
 * Four SwapKit identifiers, one set of rules: they take the deposit as a
 * payment to a rotating vault carrying a memo, they read a swap's refund
 * destination from the inbound transaction's origin, and their own indexer
 * rather than SwapKit's is where an inbound hash can be found. Every one of
 * those decisions used to name the two providers it knew about, which is a
 * list that silently went stale the moment a third arrived.
 */
export function isThorchainFamily(provider: SwapKitProviderEnum): boolean {
  return (
    provider === SwapKitProviderEnum.MayachainStreaming ||
    provider === SwapKitProviderEnum.Mayachain ||
    provider === SwapKitProviderEnum.ThorchainStreaming ||
    provider === SwapKitProviderEnum.Thorchain
  );
}
