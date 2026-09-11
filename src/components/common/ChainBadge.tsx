import React from "react";

import { getChainIcon } from "../swap/chainIcons";

/**
 * A chain's badge, at whatever size the caller has room for.
 *
 * Not every chain has a bundled icon, and a row that sometimes has one and
 * sometimes has nothing does not line up. The fallback keeps the circle and
 * puts the chain code in it, so the space is always claimed and the chain is
 * still named.
 *
 * That fallback is drawn with a border rather than a fill, because this sits
 * on two different grounds — the picker's rows and the darker field on the
 * address book form — and a filled circle disappears into one of them.
 */
export function ChainBadge({ chain, size }: { chain: string; size: number }) {
  const icon = getChainIcon(chain);

  if (icon) {
    return (
      <img
        src={icon}
        alt=""
        data-testid="chain-badge"
        width={size}
        height={size}
        style={{ borderRadius: "50%", display: "block", flexShrink: 0 }}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      data-testid="chain-badge"
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: "50%",
        border: "1px solid var(--color-zingo)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        // Three characters have to fit inside the circle at any size the
        // callers ask for, so the type scales with it rather than being picked
        // for one of them.
        fontSize: Math.max(7, Math.round(size * 0.32)),
        fontWeight: 600,
        lineHeight: 1,
      }}
    >
      {chain.slice(0, 3).toUpperCase()}
    </div>
  );
}
