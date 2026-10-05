import { act, renderHook } from "@testing-library/react";
import { ipcRenderer } from "../electronBridge";
import {
  CreationTypeEnum,
  PerformanceLevelEnum,
  ServerChainNameEnum,
  ServerSelectionEnum,
  WalletType,
} from "../components/appstate";
import { AUTO_SYNC_INTERVAL_MS, AUTO_SYNC_SETTING, AUTO_SYNC_STARTUP_DELAY_MS, useAutoSyncAll } from "./useAutoSyncAll";
import type { SyncAllRunCore } from "./useSyncAllRun";

jest.mock("../electronBridge");

const wallet = (id: number, chain_name: ServerChainNameEnum = ServerChainNameEnum.mainChainName): WalletType => ({
  id,
  fileName: "",
  alias: `Wallet ${id}`,
  chain_name,
  creationType: CreationTypeEnum.Main,
  uri: "",
  selection: ServerSelectionEnum.list,
  performanceLevel: PerformanceLevelEnum.High,
});

const OPEN = 1;
const WALLETS = [wallet(3, ServerChainNameEnum.testChainName), wallet(OPEN), wallet(2)];

const core = (phase: SyncAllRunCore["phase"], start: jest.Mock): SyncAllRunCore => ({
  phase,
  wallets: [],
  progress: {},
  endedIds: [],
  cancelling: false,
  skipping: false,
  start,
  cancel: jest.fn(),
  skip: jest.fn(),
  dismiss: jest.fn(),
  releaseForScreen: jest.fn(),
  setWatched: jest.fn(),
});

type Props = { phase: SyncAllRunCore["phase"]; ready: boolean; wallets: WalletType[] };

/** The scheduler over a run whose phase the test moves by hand. */
const mount = async (settings: Record<string, unknown> | null, initial: Partial<Props> = {}) => {
  (ipcRenderer.invoke as jest.Mock).mockImplementation(async (channel: string) =>
    channel === "loadSettings" ? settings : undefined,
  );
  const start = jest.fn();
  const view = renderHook(
    ({ phase, ready, wallets }: Props) => useAutoSyncAll(core(phase, start), wallets, OPEN, ready),
    { initialProps: { phase: "idle", ready: true, wallets: WALLETS, ...initial } },
  );
  // The settings are read before anything is scheduled.
  await act(async () => {
    await Promise.resolve();
  });
  return { start, ...view };
};

const advance = (ms: number) => act(() => void jest.advanceTimersByTime(ms));

beforeEach(() => {
  jest.useFakeTimers();
  (ipcRenderer.invoke as jest.Mock).mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("useAutoSyncAll", () => {
  it("starts a run by itself shortly after the app has its wallet open", async () => {
    const { start } = await mount({});

    advance(AUTO_SYNC_STARTUP_DELAY_MS - 1);
    expect(start).not.toHaveBeenCalled();
    advance(1);

    // In the run's order, and marked as one nobody asked for.
    expect(start).toHaveBeenCalledTimes(1);
    expect(start.mock.calls[0][0].map((w: WalletType) => w.id)).toEqual([1, 2, 3]);
    expect(start.mock.calls[0][1]).toBe(true);
  });

  it("waits for the app to be past its loading screen", async () => {
    const { start, rerender } = await mount({}, { ready: false });

    advance(AUTO_SYNC_INTERVAL_MS);
    expect(start).not.toHaveBeenCalled();

    rerender({ phase: "idle", ready: true, wallets: WALLETS });
    advance(AUTO_SYNC_STARTUP_DELAY_MS);
    expect(start).toHaveBeenCalledTimes(1);
  });

  // Counted from the end of a run, so one that overruns is never run into.
  it("starts the next one a quarter of an hour after a run ends", async () => {
    const { start, rerender } = await mount({});
    advance(AUTO_SYNC_STARTUP_DELAY_MS);
    expect(start).toHaveBeenCalledTimes(1);

    rerender({ phase: "running", ready: true, wallets: WALLETS });
    advance(AUTO_SYNC_INTERVAL_MS * 3);
    expect(start).toHaveBeenCalledTimes(1);

    rerender({ phase: "idle", ready: true, wallets: WALLETS });
    advance(AUTO_SYNC_INTERVAL_MS - 1);
    expect(start).toHaveBeenCalledTimes(1);
    advance(1);
    expect(start).toHaveBeenCalledTimes(2);
  });

  // The wallet on screen syncs itself. With no other, a run would only flash
  // its line under the wallet bar.
  it("starts nothing when the open wallet is the only one", async () => {
    const { start } = await mount({}, { wallets: [wallet(OPEN)] });

    advance(AUTO_SYNC_STARTUP_DELAY_MS + AUTO_SYNC_INTERVAL_MS * 2);

    expect(start).not.toHaveBeenCalled();
  });

  it("is on unless the user has turned it off", async () => {
    const on = await mount({});
    expect(on.result.current.enabled).toBe(true);
    on.unmount();

    const off = await mount({ [AUTO_SYNC_SETTING]: false });
    expect(off.result.current.enabled).toBe(false);
    advance(AUTO_SYNC_STARTUP_DELAY_MS + AUTO_SYNC_INTERVAL_MS);
    expect(off.start).not.toHaveBeenCalled();
  });

  it("stops when it is turned off, saves the choice, and starts again when turned on", async () => {
    const { start, result } = await mount({});

    act(() => result.current.setEnabled(false));
    expect(ipcRenderer.invoke).toHaveBeenCalledWith("saveSettings", { key: AUTO_SYNC_SETTING, value: false });
    advance(AUTO_SYNC_STARTUP_DELAY_MS + AUTO_SYNC_INTERVAL_MS);
    expect(start).not.toHaveBeenCalled();

    act(() => result.current.setEnabled(true));
    advance(AUTO_SYNC_STARTUP_DELAY_MS);
    expect(start).toHaveBeenCalledTimes(1);
  });
});
