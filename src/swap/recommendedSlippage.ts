import { SwapKitProviderEnum } from "./enums/SwapKitProviderEnum";

/**
 * How much price movement a swap tolerates before the provider gives up and
 * refunds, and why one number does not fit every provider.
 *
 * The tolerance is sent with the quote, so it is chosen before the user has
 * picked a route — one value covers every provider the quote answers with.
 * That is fine while a provider honours the price it quoted. Flashnet does
 * not: its quote carries a two-minute TTL, and its own documentation says a
 * late deposit is "always accepted and repriced at the live market rate",
 * with a market move past the tolerance refunding automatically
 * (`slippage_exceeded`).
 *
 * A Zcash deposit cannot arrive inside two minutes — it is a deshield and
 * then a transparent spend, each waiting on a block — so a Flashnet swap is
 * always repriced, and the tolerance is the only thing standing between
 * delivery and a refund that costs the deposit fee and hours of waiting. At
 * 1% a mainnet swap was refunded on a 3.5% move (order ord_01a095f2,
 * 2026-09-12). A tighter tolerance is not safer here; it just fails slower.
 */

/** Where a swap starts, and what a price-honouring provider keeps. */
export const DEFAULT_SLIPPAGE_BPS = 100;

/**
 * Room left for the market to move while the deposit confirms, on top of
 * whatever the route already expects to cost. The route's own figure covers
 * the trade; this covers the wait, which is the part that refunded us.
 */
export const MARKET_MOVE_HEADROOM_BPS = 300;

/**
 * Whether the provider reprices a deposit that arrives after its quote
 * expired instead of honouring the quoted price.
 */
export function repricesLateDeposits(provider: SwapKitProviderEnum): boolean {
  return provider === SwapKitProviderEnum.Flashnet;
}

/**
 * The tolerance this route wants.
 *
 * `routeSlippageBps` is the route's own `totalSlippageBps` — what the trade
 * is expected to cost before any waiting. A tolerance below that refuses the
 * route the provider just quoted, so the headroom is added on top of it
 * rather than used as the whole budget. Absent (providers vary in what they
 * report), the headroom alone is the floor.
 */
export function recommendedSlippageBps(provider: SwapKitProviderEnum, routeSlippageBps?: number): number {
  if (!repricesLateDeposits(provider)) return DEFAULT_SLIPPAGE_BPS;
  const routeCost = typeof routeSlippageBps === "number" && routeSlippageBps > 0 ? routeSlippageBps : 0;
  return routeCost + MARKET_MOVE_HEADROOM_BPS;
}
