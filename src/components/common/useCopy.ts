import { useCallback, useEffect, useRef, useState } from "react";
import { clipboard } from "../../electronBridge";

// Shared copy-to-clipboard primitive used by every copy interaction in the app.
// Exposes a `copied` flag that auto-resets after `timeoutMs` so callers can show
// a transient "Copied!" indicator and disable the trigger while it's true.
//
// The timeout defaults to 3s; every caller in the app currently passes 1500 so
// copy feedback feels consistently quick.
export function useCopy(timeoutMs: number = 3000): { copied: boolean; copy: (text: string) => void } {
  const [copied, setCopied] = useState<boolean>(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const copy = useCallback(
    (text: string) => {
      if (!text) return;
      clipboard.writeText(text);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), timeoutMs);
    },
    [timeoutMs],
  );

  return { copied, copy };
}
