import React, { createContext, ReactNode, useContext, useEffect, useState } from "react";

import { native } from "../electronBridge";
import { ChainNameEnum } from "../swap/enums/ChainNameEnum";
import { SwapService, SwapStore, createSwapService, deriveWalletFingerprint } from "../swap";
import type { SwapRecordType } from "../swap";
import { SWAPKIT_API_KEY } from "../swap/swapKitSecrets";

/**
 * Provides the singleton `SwapService` for the loaded wallet, and owns the
 * polling lifecycle: non-terminal records from a previous session resume
 * tracking on mount, and the poller is stopped on unmount so no timer
 * survives a wallet switch. `SwapPoller` stops itself once nothing is left to
 * poll, and `SwapService.commitRoute` / `markBroadcasted` re-arm it.
 *
 * The context value is `null` off mainnet, which is a second gate behind the
 * UI hiding its own entry points: SwapKit routes none of our providers on
 * testnet or regtest.
 */
const SwapServiceContext = createContext<SwapService | null>(null);

export type SwapServiceProviderProps = {
  chainName: ChainNameEnum;
  /**
   * Whether a wallet is open. The bind reads the wallet's UFVK, so with none
   * open there is nothing to bind to and the attempt would only log a failure.
   */
  enabled?: boolean;
  /** Override the bundled API key. Intended for tests. */
  apiKey?: string;
  children: ReactNode;
};

export function SwapServiceProvider({ chainName, enabled = true, apiKey, children }: SwapServiceProviderProps) {
  // Two concerns, deliberately decoupled:
  //
  //   A. Binding the store to the wallet. Swap history is local data, keyed by
  //      a fingerprint derived from the wallet's UFVK, so it must be readable
  //      in every mode and on every chain. It needs no server, so it always
  //      runs. Without it the History screen shows no swap rows.
  //
  //   B. Creating the service (quotes and polling). That talks to a
  //      mainnet-only provider and needs connectivity, so it is gated on the
  //      chain. Elsewhere the service stays null while the store stays bound,
  //      and the rows still render.
  const [service, setService] = useState<SwapService | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let created: SwapService | null = null;

    (async () => {
      try {
        const raw = await native.get_ufvk();
        if (cancelled) return;
        const ufvk: string = raw ? (JSON.parse(raw).ufvk ?? "") : "";
        const fingerprint = deriveWalletFingerprint(ufvk);
        if (!fingerprint) {
          console.error("SwapServiceProvider: the wallet yielded an empty fingerprint");
          return;
        }
        await SwapStore.bindToWallet(fingerprint);
        if (cancelled) return;

        if (chainName !== ChainNameEnum.mainChainName) {
          setService(null);
          return;
        }
        created = createSwapService({ apiKey: apiKey ?? SWAPKIT_API_KEY, chainName });
        if (cancelled) return;
        setService(created);
        created.startPolling();
      } catch (error) {
        console.error(`SwapServiceProvider: init failed ${error}`);
      }
    })();

    return () => {
      cancelled = true;
      if (created) created.stopPolling();
      setService(null);
    };
  }, [chainName, enabled, apiKey]);

  return <SwapServiceContext.Provider value={service}>{children}</SwapServiceContext.Provider>;
}

/**
 * Returns `null` off mainnet and while the service is still being built, so
 * callers branch on it to hide the swap entry point.
 */
export function useSwapService(): SwapService | null {
  return useContext(SwapServiceContext);
}

/**
 * The swap records for the bound wallet, kept live by the store's own change
 * notifications. Reads the store rather than the service, so History still
 * lists past swaps off mainnet and offline, where the service is `null`.
 */
export function useSwapRecords(): SwapRecordType[] {
  const [records, setRecords] = useState<SwapRecordType[]>([]);

  useEffect(() => {
    let cancelled = false;
    // subscribe() only registers; it does not replay. The bind notifies
    // subscribers, but History mounts on a route change, long after the
    // provider bound the store, so without this read the list stays empty
    // until the next mutation happens to arrive.
    const unsubscribe = SwapStore.subscribe(setRecords);
    SwapStore.readAll()
      .then((current) => {
        // A notification that landed while the read was in flight is newer
        // than what the read returned, so it must not be overwritten.
        if (!cancelled) setRecords((previous) => (previous.length === 0 ? current : previous));
      })
      .catch((error) => console.error(`useSwapRecords: initial read failed ${error}`));

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return records;
}
