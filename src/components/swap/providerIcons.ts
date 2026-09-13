import maya from "../../assets/chains/maya.png";
import near from "../../assets/chains/near.png";
import thor from "../../assets/chains/thor.png";
import flashnet from "../../assets/providers/flashnet.png";
import { SwapKitProviderEnum } from "../../swap";

/**
 * Bundled logos for the providers a swap can run through, keyed by provider.
 *
 * Bundled for the reason the chain badges are (see `chainIcons.ts`), and one
 * more: these draw on every swap row of the history, which can be long, and a
 * logo fetched per row would tell the CDN which providers this wallet swaps
 * with each time the list is opened. A bundled PNG costs no request at all.
 *
 * Maya, THORChain and NEAR are their chains' own logos, already bundled as
 * badges. Flashnet's was pulled once from the image SwapKit's `/track` names
 * for it (`tokens.swapkit.dev/images/flashnet.png`). Only the providers the
 * registry routes are listed; a provider without one shows no icon.
 */
const PROVIDER_ICONS: Partial<Record<SwapKitProviderEnum, string>> = {
  [SwapKitProviderEnum.MayachainStreaming]: maya,
  [SwapKitProviderEnum.ThorchainStreaming]: thor,
  [SwapKitProviderEnum.Near]: near,
  [SwapKitProviderEnum.Flashnet]: flashnet,
};

export function getProviderIcon(provider: string | undefined): string | undefined {
  return provider ? PROVIDER_ICONS[provider as SwapKitProviderEnum] : undefined;
}
