import routes from "../constants/routes.json";

/** The key a session with no wallet open is rendered under. */
export const NO_WALLET_KEY = "no-wallet";

/**
 * The key the swap provider is rendered under, given the key it is rendered
 * under now.
 *
 * That key is the whole screen's identity: it keys a subtree that holds the
 * loading screen itself. `currentWallet` is set while that screen is still
 * opening the wallet, so keying straight off it remounted the loading screen in
 * the middle of its own work, and its startup ran again from the top — a second
 * wallet-folder check, a second race of the server list that could land on a
 * different server, and a second `init_from_b64` against it. A launch log shows
 * both passes: one opening on zec.rocks, the one that won opening on
 * na.zec.rocks a second later.
 *
 * So the key stands still for as long as the loading route is on screen, and
 * takes the wallet that was opened on the render that leaves it. Nothing is
 * lost by waiting: the provider is disabled for that whole stretch, and it is
 * that `enabled` going false and true again — not this key — that releases the
 * departing wallet's store and binds the arriving one.
 */
export function nextSwapProviderKey(
  held: string | number,
  pathname: string,
  walletId: string | number | undefined,
): string | number {
  if (pathname === routes.LOADING) return held;
  return walletId ?? NO_WALLET_KEY;
}
