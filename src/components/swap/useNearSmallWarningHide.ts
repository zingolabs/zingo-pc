import { useEffect, useState } from "react";
import { ipcRenderer } from "../../electronBridge";

/** Per app, whatever the wallet: the warning is about NEAR, not about a wallet. */
export const NEAR_SMALL_WARNING_HIDDEN_KEY = "swap_near_small_warning_hidden";

type HideState = { loaded: boolean; hidden: boolean };

let shared: HideState = { loaded: false, hidden: false };
const listeners = new Set<(state: HideState) => void>();
const publish = (next: HideState) => {
  shared = next;
  listeners.forEach((listener) => listener(next));
};

/** Whether the user asked not to see NEAR's no-refunds warning again. */
export function useNearSmallWarningHide(): HideState & {
  setHidden: (hidden: boolean) => void;
} {
  const [state, setState] = useState<HideState>(shared);

  useEffect(() => {
    listeners.add(setState);
    if (!shared.loaded) {
      ipcRenderer
        .invoke("loadSettings")
        .then((settings: Record<string, unknown> | undefined) =>
          publish({ loaded: true, hidden: settings?.[NEAR_SMALL_WARNING_HIDDEN_KEY] === true }),
        )
        .catch(() => publish({ loaded: true, hidden: false }));
    }
    return () => {
      listeners.delete(setState);
    };
  }, []);

  const setHidden = (hidden: boolean) => {
    publish({ loaded: true, hidden });
    ipcRenderer
      .invoke("saveSettings", { key: NEAR_SMALL_WARNING_HIDDEN_KEY, value: hidden })
      .catch((error: unknown) => console.log(`Hiding the NEAR no-refunds warning failed: ${error}`));
  };

  return { ...state, setHidden };
}
