import { useCallback, useEffect, useRef, useState } from "react";
import { ipcRenderer } from "../electronBridge";
import { WalletType } from "../components/appstate";
import { syncAllOrder } from "./syncAllOrder";
import { SyncAllRunCore } from "./useSyncAllRun";

/**
 * Starts "sync all wallets" without being asked: once after the app has
 * opened its wallet, and again a while after each run ends.
 *
 * The wallet on screen keeps itself at the tip. The others only move when a
 * run takes them, so a user who never asks finds them days behind on the day
 * they switch. This keeps them close, and is a setting the user can turn off,
 * after which a run only starts from the Wallet menu.
 */

/** Counted from the end of a run, so one that overruns is never run into. */
export const AUTO_SYNC_INTERVAL_MS = 15 * 60 * 1000;
// The first run waits for the wallet on screen to get going: its launch races
// servers and starts its own engine, and a second wallet opening in the same
// seconds is in the way of the one the user is waiting to see.
export const AUTO_SYNC_STARTUP_DELAY_MS = 10 * 1000;

export const AUTO_SYNC_SETTING = "autoSyncAllWallets";

export function useAutoSyncAll(
  run: SyncAllRunCore,
  wallets: readonly WalletType[],
  openWalletId: number | undefined,
  /** The app has a wallet open and is past its loading screen. */
  ready: boolean,
): { enabled: boolean; setEnabled: (enabled: boolean) => void; nextRunAt: number | null } {
  // Unknown until the settings are read. Nothing starts before then: a user
  // who turned this off must not get one last run on every launch.
  const [enabled, setEnabledState] = useState<boolean | null>(null);
  // Bumped to schedule again when a due run found nothing to do.
  const [tick, setTick] = useState<number>(0);
  // When the next run is due, for the settings to count down to. Null while
  // nothing is scheduled: turned off, not ready yet, or a run going.
  const [nextRunAt, setNextRunAt] = useState<number | null>(null);

  const walletsRef = useRef(wallets);
  walletsRef.current = wallets;
  const openIdRef = useRef(openWalletId);
  openIdRef.current = openWalletId;
  const startRef = useRef(run.start);
  startRef.current = run.start;
  const previousPhaseRef = useRef(run.phase);
  // When the last run ended, whoever started it. Null until one has.
  const lastEndedAtRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const settings = await ipcRenderer.invoke("loadSettings");
      // On unless the user has said otherwise.
      if (!cancelled) setEnabledState(settings?.[AUTO_SYNC_SETTING] ?? true);
    })().catch(() => {
      if (!cancelled) setEnabledState(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    void ipcRenderer.invoke("saveSettings", { key: AUTO_SYNC_SETTING, value: next });
  }, []);

  useEffect(() => {
    if (previousPhaseRef.current === "running" && run.phase !== "running") {
      lastEndedAtRef.current = Date.now();
    }
    previousPhaseRef.current = run.phase;

    if (enabled !== true || !ready || run.phase === "running") {
      setNextRunAt(null);
      return;
    }

    const delay: number =
      lastEndedAtRef.current === null
        ? AUTO_SYNC_STARTUP_DELAY_MS
        : Math.max(0, lastEndedAtRef.current + AUTO_SYNC_INTERVAL_MS - Date.now());
    setNextRunAt(Date.now() + delay);
    const timer = setTimeout(() => {
      // The wallet on screen syncs itself, so with no other there is nothing
      // for a run to do, and starting one would only flash its line.
      if (!walletsRef.current.some((w) => w.id !== openIdRef.current)) {
        lastEndedAtRef.current = Date.now();
        setTick((n) => n + 1);
        return;
      }
      startRef.current(syncAllOrder(walletsRef.current), true);
    }, delay);
    return () => clearTimeout(timer);
  }, [enabled, ready, run.phase, tick]);

  return { enabled: enabled === true, setEnabled, nextRunAt };
}

export default useAutoSyncAll;
