import { useCallback, useEffect, useRef, useState } from "react";
import { clipboard } from "../../electronBridge";

// Shared copy-to-clipboard primitive used by every copy interaction in the app.
// Exposes a `copied` flag that auto-resets after `timeoutMs` so callers can show
// a transient "Copied!" indicator and disable the trigger while it's true.
//
// The timeout defaults to 3s. Pass 5000 (or longer) for explicit "Copy X"
// buttons where the user is more likely to look away after clicking; 1500 is a
// good fit for inline click-to-copy regions where the feedback should be quick.
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
