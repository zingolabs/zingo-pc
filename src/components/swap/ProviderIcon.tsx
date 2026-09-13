import React from "react";

import { providerShortLabel } from "../../swap";
import type { SwapKitProviderEnum } from "../../swap";
import { getProviderIcon } from "./providerIcons";

type ProviderIconProps = {
  provider: string | undefined;
  size: number;
  /**
   * Beside text that already names the provider, the icon only repeats it, so
   * it is hidden from assistive technology rather than read out twice. Where
   * the icon stands alone, as on a history row, it carries the name.
   */
  decorative?: boolean;
};

/** A provider's logo, round, or nothing for a provider without one. */
const ProviderIcon: React.FC<ProviderIconProps> = ({ provider, size, decorative }) => {
  const icon = getProviderIcon(provider);
  if (!icon || !provider) return null;
  const name = providerShortLabel(provider as SwapKitProviderEnum);
  return (
    <img
      src={icon}
      alt={decorative ? "" : name}
      aria-hidden={decorative ? true : undefined}
      title={name}
      width={size}
      height={size}
      data-testid="provider-icon"
      style={{ borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
    />
  );
};

export default ProviderIcon;
