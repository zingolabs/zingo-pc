import React, { useEffect, useState } from "react";

import { ipcRenderer } from "../../electronBridge";
import type { TokenEntryType } from "../../swap";

/**
 * A token's logo, resolved through the main process.
 *
 * The renderer cannot load `logoURI` itself: `img-src` allows only 'self' and
 * data:, and the host arrives inside SwapKit's catalog rather than being ours
 * to allowlist. Main fetches it and hands back a data URI, cached for the
 * session.
 *
 * A logo that will not resolve draws the ticker's first characters instead.
 * SwapKit's catalog does point at images that 404, so the fallback is the
 * ordinary case rather than an error path.
 */
type TokenLogoProps = {
  token: TokenEntryType | null;
  size: number;
};

const TokenLogo: React.FC<TokenLogoProps> = ({ token, size }) => {
  const [dataUri, setDataUri] = useState<string | null>(null);
  const logoURI = token?.logoURI;

  useEffect(() => {
    setDataUri(null);
    if (!logoURI) return;
    let cancelled = false;
    ipcRenderer
      .invoke("swapLogo:get", logoURI)
      .then((uri: string | null) => {
        if (!cancelled) setDataUri(uri);
      })
      .catch(() => {
        // Already the fallback's job; a missing picture is not worth a log.
      });
    return () => {
      cancelled = true;
    };
  }, [logoURI]);

  const shared: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: size / 2,
    flexShrink: 0,
  };

  if (dataUri) {
    return <img src={dataUri} alt="" style={{ ...shared, objectFit: "contain" }} />;
  }

  return (
    <div
      style={{
        ...shared,
        background: "var(--color-background-dark)",
        border: "1px solid var(--color-primary)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.38,
      }}
    >
      {(token?.ticker ?? "?").slice(0, 3)}
    </div>
  );
};

export default TokenLogo;
