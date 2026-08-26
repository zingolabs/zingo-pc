import { SwapKitProviderEnum } from "./enums/SwapKitProviderEnum";

/**
 * How this wallet pays an outbound deposit, and what that costs on the Zcash
 * side before the swap's own fees are counted.
 *
 * Both answers hang off the same fact, which is why they live together: Maya
 * and THORChain read a swap's refund destination from the inbound
 * transaction's origin, and a shielded spend does not expose one. Their
 * deposits therefore go through the ZIP 320 ephemeral hop, which is two
 * transactions rather than one — so the routing decision and the fee estimate
 * cannot be allowed to disagree about which providers are involved.
 */

/**
 * Whether the deposit has to leave through the ZIP 320 ephemeral hop.
 *
 * NEAR Intents and Flashnet bind refunds to the per-quote deposit address, so
 * they need no wallet-controlled origin and take the cheaper single-hop path.
 */
export function needsEphemeralRoute(provider: SwapKitProviderEnum): boolean {
  return provider === SwapKitProviderEnum.MayachainStreaming || provider === SwapKitProviderEnum.ThorchainStreaming;
}

/**
 * ZIP 317's marginal fee, in zatoshis. A transaction pays this per logical
 * action beyond the two-action grace.
 */
const MARGINAL_FEE_ZATS = 5_000;

/**
 * Logical actions budgeted for one deposit transaction: room for a couple of
 * shielded inputs, the transparent output, and change. Generous rather than
 * exact — see `zecNetworkFeeReserve` for why erring high is the safe side.
 */
const BUDGETED_ACTIONS = 4;

/**
 * What to hold back from the spendable balance for the Zcash network fee on an
 * outbound deposit, in ZEC display units.
 *
 * An estimate, not a quote. The real figure comes from proposing the
 * transaction, and the deposit address that a proposal needs does not exist
 * until the route is committed — by which point the user has already been
 * shown a maximum and told whether they can afford it. So the screen reserves
 * a figure instead.
 *
 * It errs high deliberately. Reserving a few thousand zatoshis too many costs
 * the user a swap amount a hair below what they could have sent; reserving too
 * few walks them into a proposal that fails at `propose_send` with an error
 * about funds, after they have already committed the route at the provider.
 * The two mistakes are not the same size.
 *
 * Doubled for the ephemeral route, which is two transactions: the shielded
 * spend that funds the ephemeral address, and the transparent spend that pays
 * the vault. Each pays its own fee.
 */
export function zecNetworkFeeReserve(provider: SwapKitProviderEnum): number {
  const perTransactionZats = MARGINAL_FEE_ZATS * BUDGETED_ACTIONS;
  const transactions = needsEphemeralRoute(provider) ? 2 : 1;
  return (perTransactionZats * transactions) / 1e8;
}
