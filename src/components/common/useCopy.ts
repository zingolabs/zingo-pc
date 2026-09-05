import { useCallback, useEffect, useRef, useState } from "react";
import { clipboard } from "../../electronBridge";

// Shared copy-to-clipboard primitive used by every copy interaction in the app.
// Exposes a `copied` flag that auto-resets after `timeoutMs` so callers can show
// a transient "Copied!" indicator and disable the trigger while it's true.
//
// The timeout defaults to 3s. Pass 5000 (or longer) for explicit "Copy X"
// buttons where the user is more likely to look away after clicking; 1500 is a
// good fit for inline click-to-copy regions where the feedback should be quick.
//
// There are three shapes in the app, and the timeout follows from which one a
// screen is using rather than being chosen per screen:
//
//   - **The value is the button** (1500). A row showing a truncated address,
//     where clicking both reveals the rest and copies it. The transfer detail,
//     the sidebar, the messages list and the address book.
//   - **An icon beside the value** (1500). `CopyField`, for a detail screen
//     that already shows the value in full, so the click has only one job.
//   - **A button that says "Copy"** (5000). Receive, where copying the address
//     is the entire point of the screen rather than something offered beside a
//     fact — and where the user is most likely to look away before reading the
//     confirmation.
//
// Every one of them says "Copied!" and every one is a real `<button>`. That
// was not true until the copy targets were swept in August 2026: two were a
// `div` with an onClick, and one called the clipboard directly and said
// nothing at all.
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
