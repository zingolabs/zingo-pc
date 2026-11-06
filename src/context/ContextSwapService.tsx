import React, { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";

import { ChainNameEnum } from "../swap/enums/ChainNameEnum";
import { SwapService, SwapStore, createSwapService, readCurrentWalletKeys, swapRecordToValueTransfer } from "../swap";
import type ValueTransferClass from "../components/appstate/classes/ValueTransferClass";
import type { SwapRecordType } from "../swap";
import { SWAPKIT_API_KEY } from "../swap/swapKitSecrets";
import { native } from "../electronBridge";
import { payoutNotesFrom } from "../swap/payoutNotes";
import { awaitsSaleDeposit, sentPaymentsFrom } from "../swap/saleDeposits";
import { ContextApp } from "./ContextAppState";

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

/**
 * Maya refuses a unified address with only an Orchard receiver: Orchard takes
 * no new outputs since NU6.3 (ZIP 2006). It pays the Sapling one.
 */
async function newShieldedAddress(): Promise<string> {
  const parsed: { encoded_address?: string } = JSON.parse(await native.create_new_unified_address("oz"));
  if (!parsed.encoded_address) {
    throw new Error("the wallet named no address");
  }
  return parsed.encoded_address;
}

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
        const { fingerprint, ufvk } = await readCurrentWalletKeys();
        if (cancelled) return;
        if (!fingerprint) {
          console.error("SwapServiceProvider: the wallet yielded an empty fingerprint");
          return;
        }
        // The UFVK goes with it: the records are encrypted with a key derived
        // from it, which is what lets them move with the wallet.
        await SwapStore.bindToWallet(fingerprint, ufvk);
        if (cancelled) return;

        if (chainName !== ChainNameEnum.mainChainName) {
          setService(null);
          return;
        }
        created = createSwapService({ apiKey: apiKey ?? SWAPKIT_API_KEY, chainName, newShieldedAddress });
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
      // Release the store along with the service. The binding is module state,
      // so leaving it set would keep naming the departing wallet's bucket
      // until the next wallet finishes binding — and a History mounted inside
      // that window would list swaps belonging to a wallet that is no longer
      // open. Fire-and-forget: it is queued behind any write still finishing,
      // and there is nothing useful to do if it fails.
      SwapStore.unbind().catch((error) => console.error(`SwapServiceProvider: unbind failed ${error}`));
    };
  }, [chainName, enabled, apiKey]);

  usePayoutClaims(service);
  useSaleDepositClaims(service);

  return <SwapServiceContext.Provider value={service}>{children}</SwapServiceContext.Provider>;
}

/**
 * Hands the wallet's sends to the service while a sale has no deposit tied
 * to it, so a deposit that left without the send reporting it is found
 * without the user asking to pay again.
 */
function useSaleDepositClaims(service: SwapService | null): void {
  const { valueTransfers } = useContext(ContextApp);
  const records = useSwapRecords();
  const waiting = records.some(awaitsSaleDeposit);

  useEffect(() => {
    if (!service || !valueTransfers || !waiting) {
      return;
    }
    service
      .claimSaleDeposits(sentPaymentsFrom(valueTransfers))
      .catch((error) => console.error(`SwapServiceProvider: sale deposit claim failed ${error}`));
  }, [service, valueTransfers, waiting]);
}

/**
 * Returns `null` off mainnet and while the service is still being built, so
 * callers branch on it to hide the swap entry point.
 */
/**
 * Hands every payout the wallet received to the service, which ties it to its
 * purchase. A payout it could not tie yet, because Midgard does not know the
 * swap, goes again with the next change to the wallet's transfers.
 */
function usePayoutClaims(service: SwapService | null): void {
  const { valueTransfers } = useContext(ContextApp);
  const settled = useRef(new Set<string>());
  const running = useRef(false);

  useEffect(() => {
    if (!service || !valueTransfers || running.current) {
      return;
    }
    const notes = payoutNotesFrom(valueTransfers).filter((note) => !settled.current.has(note.txid));
    if (notes.length === 0) {
      return;
    }
    running.current = true;
    service
      .claimPayouts(notes)
      .then((txids) => txids.forEach((txid) => settled.current.add(txid)))
      .catch((error) => console.error(`SwapServiceProvider: payout claim failed ${error}`))
      .finally(() => {
        running.current = false;
      });
  }, [service, valueTransfers]);
}

export function useSwapService(): SwapService | null {
  return useContext(SwapServiceContext);
}

/**
 * zingolib's transfers with this wallet's swaps folded in, newest first.
 *
 * A swap moves the user's money, so a list of what their money did is wrong
 * without them. Both screens that show such a list read it from here rather
 * than merging their own, which is what keeps the History page and the
 * Dashboard's summary from disagreeing about the same five rows.
 *
 * Swaps are not deduplicated against the outbound transfer that funded them.
 * The user sees the swap beside the send that paid for it, so the chronology
 * stays explicit and the zingolib-reported transaction stays visible.
 */
export function useValueTransfersWithSwaps(valueTransfers: ValueTransferClass[]): ValueTransferClass[] {
  const swapRecords = useSwapRecords();

  return useMemo(() => {
    if (swapRecords.length === 0) return valueTransfers;
    return [...valueTransfers, ...swapRecords.map(swapRecordToValueTransfer)].sort((a, b) => b.time - a.time);
  }, [valueTransfers, swapRecords]);
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
