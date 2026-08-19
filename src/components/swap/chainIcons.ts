import ada from "../../assets/chains/ada.png";
import adi from "../../assets/chains/adi.png";
import arb from "../../assets/chains/arb.png";
import atom from "../../assets/chains/atom.png";
import avax from "../../assets/chains/avax.png";
import base from "../../assets/chains/base.png";
import bch from "../../assets/chains/bch.png";
import bera from "../../assets/chains/bera.png";
import bsc from "../../assets/chains/bsc.png";
import btc from "../../assets/chains/btc.png";
import cro from "../../assets/chains/cro.png";
import dash from "../../assets/chains/dash.png";
import doge from "../../assets/chains/doge.png";
import dot from "../../assets/chains/dot.png";
import eth from "../../assets/chains/eth.png";
import ftm from "../../assets/chains/ftm.png";
import gno from "../../assets/chains/gno.png";
import kava from "../../assets/chains/kava.png";
import linea from "../../assets/chains/linea.png";
import ltc from "../../assets/chains/ltc.png";
import maya from "../../assets/chains/maya.png";
import mnt from "../../assets/chains/mnt.png";
import monad from "../../assets/chains/monad.png";
import near from "../../assets/chains/near.png";
import op from "../../assets/chains/op.png";
import pol from "../../assets/chains/pol.png";
import sol from "../../assets/chains/sol.png";
import strk from "../../assets/chains/strk.png";
import sui from "../../assets/chains/sui.png";
import thor from "../../assets/chains/thor.png";
import ton from "../../assets/chains/ton.png";
import tron from "../../assets/chains/tron.png";
import xlayer from "../../assets/chains/xlayer.png";
import xlm from "../../assets/chains/xlm.png";
import xrp from "../../assets/chains/xrp.png";

/**
 * Bundled chain badge icons, keyed by SwapKit chain code (uppercase).
 *
 * Why we ship our own instead of deriving the badge from the API:
 *   - SwapKit has no reliable per-chain logo endpoint. `/chains` 404s, and the
 *     token CDN is inconsistent: `base.base.png` only exists on the `-dev`
 *     host, `bsc` uses `bsc.bnb.png`, and SwapKit's own `<chain>.<chainId>.png`
 *     convention (from their `AssetIcon` widget) 404s for most chains in prod.
 *   - Deriving the badge from a chain's native (gas) token — what we did before
 *     — renders the ETH diamond for every ETH-gas L2 (Base, Arbitrum, Optimism),
 *     so a Base token looked like it lived on Ethereum.
 *
 * The PNGs were pulled once from SwapKit's CDN (best working URL per chain) and
 * committed under `assets/chains/`. Update this map + drop a new PNG when a new
 * destination chain appears in the routable catalog.
 *
 * Ported from the mobile wallet's `chainIcons.ts`; `require` becomes an ES
 * import because webpack resolves the URL at build time where Metro hands back
 * an `ImageSourcePropType`.
 */
const CHAIN_ICONS: Record<string, string> = {
  ADA: ada,
  ADI: adi,
  ARB: arb,
  ATOM: atom,
  AVAX: avax,
  BASE: base,
  BCH: bch,
  BERA: bera,
  BSC: bsc,
  BTC: btc,
  CRO: cro,
  DASH: dash,
  DOGE: doge,
  DOT: dot,
  ETH: eth,
  FTM: ftm,
  GNO: gno,
  // Address validators key Gnosis as `GNOSIS`; same badge as `GNO`.
  GNOSIS: gno,
  KAVA: kava,
  LINEA: linea,
  LTC: ltc,
  // Polygon's old (`MATIC`) and current (`POL`) codes share one badge.
  MATIC: pol,
  MAYA: maya,
  MNT: mnt,
  MONAD: monad,
  NEAR: near,
  OP: op,
  POL: pol,
  SOL: sol,
  STRK: strk,
  SUI: sui,
  THOR: thor,
  TON: ton,
  TRON: tron,
  // Tron's SwapKit chain code is `TRX`; same badge as `TRON`.
  TRX: tron,
  XLAYER: xlayer,
  XLM: xlm,
  XRP: xrp,
};

/**
 * Resolve a chain code (e.g. `"BASE"`) to its bundled badge icon. Returns
 * `undefined` for chains we do not have an icon for — callers render no badge
 * in that case (the main token image + text label still identify the asset).
 */
export function getChainIcon(chain: string | undefined): string | undefined {
  if (!chain) return undefined;
  return CHAIN_ICONS[chain.toUpperCase()];
}
