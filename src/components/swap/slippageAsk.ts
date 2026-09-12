import { formatSlippagePercent } from "./SlippagePicker";

/**
 * What to tell the user when the route they are on needs a wider slippage
 * tolerance than the one they have.
 *
 * Kept out of the screen because it is the whole substance of the question:
 * the user is being asked to accept a larger possible loss to the market, and
 * the reason that is the better trade — a refund hours later costs the deposit
 * fee and delivers nothing — has to be in the words, not in a tooltip.
 */
export function describeSlippageAsk(args: { providerLabel: string; currentBps: number; neededBps: number }): string {
  const { providerLabel, currentBps, neededBps } = args;
  return (
    `${providerLabel} does not hold the price it quotes: the quote expires in two minutes, and a Zcash deposit ` +
    `cannot arrive that fast, so it is repriced at the market rate when it lands. At ` +
    `${formatSlippagePercent(currentBps)}% a move past that refunds the swap hours later rather than completing ` +
    `it, and the deposit fee is spent either way. Raise the tolerance to ${formatSlippagePercent(neededBps)}% ` +
    `for this route?`
  );
}
