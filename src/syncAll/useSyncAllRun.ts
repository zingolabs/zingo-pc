import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ipcRenderer } from "../electronBridge";
import { WalletType } from "../components/appstate";
import { nativeSyncAllDeps } from "./nativeSyncAllDeps";
import { SyncAllDeps, WalletProgress, runSyncAll } from "./runSyncAll";

/**
 * A run of "sync all wallets", held above the screens.
 *
 * The run goes on while the user uses the app, so its state cannot live in
 * the screen that shows it: that screen is gone as soon as they navigate. It
 * lives here, at the level of the app, and the screen and the banner read it.
 */
export type SyncAllRun = {
  phase: "idle" | "running" | "done";
  /** The wallets of the run, in the order they are taken. Empty while idle. */
  wallets: readonly WalletType[];
  progress: Readonly<Record<number, WalletProgress>>;
  /** The wallets that have ended, in the order they did. */
  endedIds: readonly number[];
  cancelling: boolean;
  skipping: boolean;
  /**
   * `automatic` is a run the app started by itself. It is quieter than one
   * the user asked for: see `start` below.
   */
  start: (wallets: readonly WalletType[], automatic?: boolean) => void;
  cancel: () => void;
  skip: () => void;
  /** Puts a finished run away. */
  dismiss: () => void;
  /**
   * Called before a wallet is opened on screen, and resolves once the run
   * holds no claim on it. A wallet file is never held by two clients.
   */
  releaseForScreen: (walletId: number) => Promise<void>;
  /** Said by the screen that shows the run, for as long as it is up. */
  setWatched: (watched: boolean) => void;
  /** Whether the app starts runs by itself. See `useAutoSyncAll`. */
  autoEnabled: boolean;
  setAutoEnabled: (enabled: boolean) => void;
  /** When the app will next start a run by itself; null when it will not. */
  nextAutoRunAt: number | null;
};

export const ended = (progress: WalletProgress): boolean => progress.kind !== "pending" && progress.kind !== "syncing";

const sameProgress = (a: WalletProgress | undefined, b: WalletProgress): boolean =>
  !!a &&
  a.kind === b.kind &&
  (a.kind !== "syncing" || (b.kind === "syncing" && a.server === b.server && a.percent === b.percent)) &&
  (a.kind !== "failed" || (b.kind === "failed" && a.reason === b.reason));

// How long opening a wallet on screen waits for the run to let go of it. The
// run's own stop is bounded at thirty seconds and a save follows it. Past
// this the open goes ahead, and the native module refuses it with its reason
// if the run still holds the file.
const RELEASE_TIMEOUT_MS = 60 * 1000;

const IDLE_RUN: SyncAllRun = {
  phase: "idle",
  wallets: [],
  progress: {},
  endedIds: [],
  cancelling: false,
  skipping: false,
  start: () => {},
  cancel: () => {},
  skip: () => {},
  dismiss: () => {},
  releaseForScreen: async () => {},
  setWatched: () => {},
  autoEnabled: false,
  setAutoEnabled: () => {},
  nextAutoRunAt: null,
};

export const SyncAllContext = createContext<SyncAllRun>(IDLE_RUN);

/** The run itself, without the setting that decides whether the app starts one. */
export type SyncAllRunCore = Omit<SyncAllRun, "autoEnabled" | "setAutoEnabled" | "nextAutoRunAt">;

export function useSyncAllRun(
  openWalletId: number | undefined,
  makeDeps: () => SyncAllDeps = nativeSyncAllDeps,
): SyncAllRunCore {
  const [phase, setPhase] = useState<SyncAllRun["phase"]>("idle");
  const [wallets, setWallets] = useState<readonly WalletType[]>([]);
  const [progress, setProgress] = useState<Record<number, WalletProgress>>({});
  const [endedIds, setEndedIds] = useState<number[]>([]);
  const [cancelling, setCancelling] = useState<boolean>(false);
  const [skipping, setSkipping] = useState<boolean>(false);

  const runningRef = useRef<boolean>(false);
  const cancelRef = useRef<boolean>(false);
  const skipRef = useRef<boolean>(false);
  // The wallet on screen, or the one about to be. Written by
  // `releaseForScreen` ahead of the state it follows.
  const openIdRef = useRef<number | undefined>(openWalletId);
  // The wallet the run has in hand, and who is waiting for it to let go.
  const inHandRef = useRef<number | null>(null);
  const waitersRef = useRef<Array<{ walletId: number; resolve: () => void }>>([]);
  // Whether a wallet of this run could not be synced, and whether the user is
  // looking at the run: what decides if an automatic one puts itself away.
  const failedRef = useRef<boolean>(false);
  const watchedRef = useRef<boolean>(false);

  useEffect(() => {
    openIdRef.current = openWalletId;
  }, [openWalletId]);

  const onProgress = useCallback((walletId: number, state: WalletProgress) => {
    if (state.kind === "syncing") {
      inHandRef.current = walletId;
    } else if (ended(state)) {
      if (state.kind === "failed") failedRef.current = true;
      if (inHandRef.current === walletId) inHandRef.current = null;
      const waiting = waitersRef.current.filter((w) => w.walletId === walletId);
      waitersRef.current = waitersRef.current.filter((w) => w.walletId !== walletId);
      waiting.forEach((w) => w.resolve());
      setEndedIds((previous) => (previous.includes(walletId) ? previous : [...previous, walletId]));
      // The wallet in hand has ended, by a skip or otherwise; the next one
      // starts with the button offered again.
      setSkipping(false);
    }
    // The run is held at the top of the app, so an update here re-renders all
    // of it. A poll that found nothing new is not one.
    setProgress((previous) =>
      sameProgress(previous[walletId], state) ? previous : { ...previous, [walletId]: state },
    );
  }, []);

  const clear = useCallback(() => {
    setPhase("idle");
    setWallets([]);
    setProgress({});
    setEndedIds([]);
  }, []);

  const start = useCallback(
    (toSync: readonly WalletType[], automatic: boolean = false) => {
      if (runningRef.current) return;
      runningRef.current = true;
      cancelRef.current = false;
      skipRef.current = false;
      failedRef.current = false;
      setWallets(toSync);
      setProgress({});
      setEndedIds([]);
      setCancelling(false);
      setSkipping(false);
      setPhase("running");

      void (async () => {
        // A run the user asked for can take hours, and the machine is kept
        // from suspending under it; the display may still sleep. One the app
        // starts by itself holds nothing: it comes round every few minutes,
        // and a wallet app that never lets a laptop sleep is not a trade the
        // user made. If the machine suspends under it, the next one picks up.
        if (!automatic) await ipcRenderer.invoke("power:keep-awake", true);
        try {
          await runSyncAll(toSync, makeDeps(), onProgress, {
            cancelled: () => cancelRef.current,
            takeSkip: () => {
              const asked = skipRef.current;
              skipRef.current = false;
              return asked;
            },
            isOpen: (walletId: number) => openIdRef.current === walletId,
          });
        } finally {
          if (!automatic) await ipcRenderer.invoke("power:keep-awake", false);
          runningRef.current = false;
          // A run nobody asked for, that nobody is looking at and that has
          // nothing to report, leaves no line behind to dismiss every few
          // minutes. One that could not sync a wallet stays, to say so.
          if (automatic && !watchedRef.current && !failedRef.current) {
            clear();
          } else {
            setPhase("done");
          }
        }
      })();
    },
    [makeDeps, onProgress, clear],
  );

  const cancel = useCallback(() => {
    if (!runningRef.current) return;
    cancelRef.current = true;
    setCancelling(true);
  }, []);

  const skip = useCallback(() => {
    if (!runningRef.current) return;
    skipRef.current = true;
    setSkipping(true);
  }, []);

  const dismiss = useCallback(() => {
    if (runningRef.current) return;
    clear();
  }, [clear]);

  const setWatched = useCallback((watched: boolean) => {
    watchedRef.current = watched;
  }, []);

  const releaseForScreen = useCallback(async (walletId: number): Promise<void> => {
    // Said first and looked second, with no await between: the run does the
    // mirror of it when it takes a wallet, so whichever runs second sees the
    // other.
    openIdRef.current = walletId;
    if (inHandRef.current !== walletId) return;
    skipRef.current = true;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, RELEASE_TIMEOUT_MS);
      waitersRef.current.push({
        walletId,
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
      });
    });
  }, []);

  return useMemo(
    () => ({
      phase,
      wallets,
      progress,
      endedIds,
      cancelling,
      skipping,
      start,
      cancel,
      skip,
      dismiss,
      releaseForScreen,
      setWatched,
    }),
    [
      phase,
      wallets,
      progress,
      endedIds,
      cancelling,
      skipping,
      start,
      cancel,
      skip,
      dismiss,
      releaseForScreen,
      setWatched,
    ],
  );
}

export default useSyncAllRun;
