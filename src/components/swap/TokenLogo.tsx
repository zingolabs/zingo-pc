import React, { useEffect, useState } from "react";

import { ipcRenderer } from "../../electronBridge";
import type { TokenEntryType } from "../../swap";
import Utils from "../../utils/utils";
import { getChainIcon } from "./chainIcons";
import { DARK_LOGO_BACKDROP, isDarkLogo } from "./darkLogos";

/**
 * Composed asset icon: the token's logo as the main image, with a small badge
 * in the bottom-right corner showing the chain logo (only when the token is not
 * the chain's native token, i.e. `chain !== symbol`).
 *
 * The badge sits over a thin ring whose colour matches the surrounding
 * `surfaceColor`, so visually it looks "punched" out of the main image —
 * borrowing the standard cross-chain wallet convention.
 *
 * Ported from the mobile wallet's `TokenLogo`. Two things differ, both forced
 * by the desktop shell rather than chosen:
 *
 *   - The main logo is fetched through the main process. `img-src` allows only
 *     'self' and data:, and the host arrives inside SwapKit's catalog rather
 *     than being ours to allowlist, so main fetches it and hands back a data
 *     URI. Mobile points an `<Image>` straight at the URL.
 *   - The badge needs no such trip: it is a bundled PNG (see `chainIcons.ts`),
 *     so webpack resolves it at build time.
 */
type TokenLogoProps = {
  token: TokenEntryType | null | undefined;
  /** Diameter of the main (token) image in pixels. */
  size: number;
  /**
   * Background colour of whatever surface the icon sits on. Drives the ring
   * around the chain badge so the badge stands out against the main image.
   */
  surfaceColor: string;
  /**
   * Render the chain badge even when the token is the chain's native asset
   * (i.e. `chain === symbol`). Used to keep the chip visual identical between
   * ZEC and any non-ZEC asset on the Swap screen so the two sides of the swap
   * look balanced.
   */
  forceBadge?: boolean;
};

const TokenLogo: React.FC<TokenLogoProps> = ({ token, size, surfaceColor, forceBadge }) => {
  const [dataUri, setDataUri] = useState<string | null>(null);
  // SwapKit's CDN occasionally hosts a `logoURI` pointer to an image that does
  // not actually exist (observed: `strk.xrp-….png` returns 404 even though the
  // response advertises that URL). Fall back to the letter avatar when the
  // fetch fails so the slot never renders empty.
  const [mainLoadFailed, setMainLoadFailed] = useState(false);
  const [badgeLoadFailed, setBadgeLoadFailed] = useState(false);
  const logoURI = token?.logoURI;

  useEffect(() => {
    setDataUri(null);
    setMainLoadFailed(false);
    setBadgeLoadFailed(false);
    if (!logoURI) return;
    let cancelled = false;
    ipcRenderer
      .invoke("swapLogo:get", logoURI)
      .then((uri: string | null) => {
        if (cancelled) return;
        if (uri) setDataUri(uri);
        else setMainLoadFailed(true);
      })
      .catch(() => {
        if (!cancelled) setMainLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [logoURI]);

  if (!token) {
    return <LetterAvatar label="?" size={size} bg="#E8E8E8" fg="#040C17" />;
  }

  const isNative = token.chain === token.symbol;
  // The chain badge is a bundled per-chain icon (see `chainIcons.ts`), keyed by
  // `token.chain`. Shown for non-native assets (a token sitting on a chain);
  // suppressed for a chain's own native asset, where the main image already IS
  // the chain — unless `forceBadge` asks for it (keeps the swap chips balanced).
  const chainIcon = getChainIcon(token.chain);
  const showBadge = (forceBadge || !isNative) && !!chainIcon;
  const badgeSize = Math.max(10, Math.round(size * 0.42));
  const ring = 2; // thickness of the surface-coloured ring around the badge
  const badgeWrap = badgeSize + ring * 2;
  // How far the badge sticks out past the main image. The ring already adds
  // `ring` px; the extra nudge gives the composition a more "applied" feel
  // without colliding with neighbouring text.
  const badgeOverhang = ring + 2;

  // Up to the first three characters for the avatar fallback — prefer the clean
  // `ticker`, fall back to whichever short identifier is available. Three
  // letters read as a mini-ticker (BTC, SOL, USD…) and fill the circle better
  // than a single glyph.
  const avatarLabel = (token.ticker || token.symbol || "?").slice(0, 3).toUpperCase();

  // Fallback avatar colour (only used when there is no logo image):
  // deterministic on the ticker so each token owns a stable, distinct colour
  // instead of a uniform grey. `getLabelColor` picks black/white text so the
  // letters stay legible on that colour.
  const seed = token.ticker || token.symbol || "?";
  const avatarBg = Utils.generateColorFromSeed(seed);
  const avatarFg = Utils.getLabelColor(avatarBg);

  // Real logos render with NO background — most are colour marks that read fine
  // on the dark surface and many carry transparent areas that an added disc
  // would ruin. The exception is the handful of near-black marks (see
  // `darkLogos.ts`): those get a light neutral canvas so their glyph stays
  // visible. Everything else stays transparent.
  const imageBg = isDarkLogo(token) ? DARK_LOGO_BACKDROP : "transparent";

  return (
    <div style={{ width: size, height: size, position: "relative", flexShrink: 0 }}>
      {dataUri && !mainLoadFailed ? (
        <img
          src={dataUri}
          alt=""
          width={size}
          height={size}
          style={{
            display: "block",
            width: size,
            height: size,
            borderRadius: size / 2,
            objectFit: "cover",
            backgroundColor: imageBg,
          }}
        />
      ) : (
        <LetterAvatar label={avatarLabel} size={size} bg={avatarBg} fg={avatarFg} />
      )}
      {showBadge && !badgeLoadFailed && (
        <div
          style={{
            position: "absolute",
            right: -badgeOverhang,
            bottom: -badgeOverhang,
            width: badgeWrap,
            height: badgeWrap,
            borderRadius: badgeWrap / 2,
            backgroundColor: surfaceColor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <img
            src={chainIcon}
            alt=""
            onError={() => setBadgeLoadFailed(true)}
            width={badgeSize}
            height={badgeSize}
            style={{ display: "block", borderRadius: badgeSize / 2, objectFit: "cover" }}
          />
        </div>
      )}
    </div>
  );
};

/**
 * Letter-avatar fallback used when the upstream image URL is missing or fails
 * to load. Matches the pattern used by Vultisig (the other open-source wallet
 * consuming SwapKit), which is visually clearer than a generic coin icon — the
 * user can tell at a glance which token it is.
 */
const LetterAvatar: React.FC<{ label: string; size: number; bg: string; fg: string }> = ({ label, size, bg, fg }) => {
  // Shrink the font as the label grows so up to three characters fit inside the
  // circle without clipping.
  const fontScale = label.length >= 3 ? 0.3 : label.length === 2 ? 0.4 : 0.5;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontSize: Math.round(size * fontScale),
          fontWeight: "bold",
          color: fg,
          textAlign: "center",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
    </div>
  );
};

export default TokenLogo;
