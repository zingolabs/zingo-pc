import {
  TotalBalanceClass,
  ValueTransferClass,
  InfoClass,
  UnifiedAddressClass,
  TransparentAddressClass,
  SyncStatusType,
  SendJsonToTypeType,
  SendProposeType,
  SendType,
  ValueTransferStatusEnum,
  ValueTransferKindEnum,
  ValueTransferPoolEnum,
  WalletType,
  ServerChainNameEnum,
} from "../components/appstate";

import { native } from "../electronBridge";
import { RPCInfoType } from "./components/RPCInfoType";
import { RPCValueTransferType } from "./components/RPCValueTransferType";
import { RPCIronwoodDrainType } from "./components/RPCIronwoodDrainType";
import {
  FfiBatchReport,
  FfiMigrationSummary,
  FfiPlan,
  FfiSplitStep,
  FfiStatus,
} from "../components/orchardMigration/privateMigrationTypes";

// zingolib emits pool names capitalized ("Orchard", "Ironwood", …); normalize them
// to the lowercase ValueTransferPoolEnum and drop anything unrecognized. Returns
// undefined for empty/absent lists so the UI can skip the "Pools" line entirely.
const VALID_POOLS: string[] = Object.values(ValueTransferPoolEnum);
const parseValueTransferPools = (raw?: string[]): ValueTransferPoolEnum[] | undefined => {
  if (!raw || raw.length === 0) return undefined;
  const pools = raw.map((p) => p.toLowerCase()).filter((p) => VALID_POOLS.includes(p)) as ValueTransferPoolEnum[];
  return pools.length > 0 ? pools : undefined;
};

export default class RPC {
  fnSetTotalBalance: (tb: TotalBalanceClass) => void;
  fnSetAddressesUnified: (abs: UnifiedAddressClass[]) => void;
  fnSetAddressesTransparent: (abs: TransparentAddressClass[]) => void;
  fnSetValueTransfersList: (t: ValueTransferClass[]) => void;
  fnSetMessagesList: (t: ValueTransferClass[]) => void;
  fnSetInfo: (info: InfoClass) => void;
  fnSetSyncStatus: (ss: SyncStatusType) => void;
  fnSetVerificationProgress: (verificationProgress: number | null) => void;
  fnSetFetchError: (command: string, error: string) => void;

  currentWallet: WalletType | null;

  updateTimerID?: NodeJS.Timeout;
  timers: NodeJS.Timeout[];

  lastBlockHeight: number;
  lastTxId?: string;

  lastPollSyncError: string;

  constructor(
    fnSetTotalBalance: (tb: TotalBalanceClass) => void,
    fnSetAddressesUnified: (abs: UnifiedAddressClass[]) => void,
    fnSetAddressesTransparent: (abs: TransparentAddressClass[]) => void,
    fnSetValueTransfersList: (t: ValueTransferClass[]) => void,
    fnSetMessagesList: (t: ValueTransferClass[]) => void,
    fnSetInfo: (info: InfoClass) => void,
    fnSetSyncStatus: (ss: SyncStatusType) => void,
    fnSetVerificationProgress: (verificationProgress: number | null) => void,
    fnSetFetchError: (command: string, error: string) => void,
    currentWallet: WalletType | null,
  ) {
    this.fnSetTotalBalance = fnSetTotalBalance;
    this.fnSetAddressesUnified = fnSetAddressesUnified;
    this.fnSetAddressesTransparent = fnSetAddressesTransparent;
    this.fnSetValueTransfersList = fnSetValueTransfersList;
    this.fnSetMessagesList = fnSetMessagesList;
    this.fnSetInfo = fnSetInfo;
    this.fnSetSyncStatus = fnSetSyncStatus;
    this.fnSetVerificationProgress = fnSetVerificationProgress;
    this.fnSetFetchError = fnSetFetchError;

    this.currentWallet = currentWallet;

    this.lastBlockHeight = 0;

    this.updateTimerID = undefined;
    this.timers = [];

    this.lastPollSyncError = "";
  }

  async runTaskPromises(): Promise<void> {
    await Promise.allSettled([
      this.fetchSyncPoll(),
      this.fetchInfo(),
      this.fetchAddresses(),
      this.fetchTotalBalance(),
      RPC.doSave(),
      this.fetchTandZandOValueTransfers(),
      this.fetchTandZandOMessages(),
      // Foreground driver: send the current window's due parts and fold in any
      // windows missed while the app was closed. No-op when none in progress.
      RPC.driveMigration(),
    ]);
  }

  async configure(): Promise<void> {
    // takes a while to start
    await this.fetchTandZandOValueTransfers();
    await this.fetchAddresses();
    await this.fetchTotalBalance();
    await this.fetchInfo();
    await this.fetchTandZandOMessages();

    // Reconcile any in-progress private migration on launch (no-op otherwise):
    // applies the safe-unattended part-state fixes zingolib recommends.
    await RPC.reconcileMigration();

    // every 5 seconds the App update part of the data
    if (!this.updateTimerID) {
      this.updateTimerID = setInterval(() => this.runTaskPromises(), 5 * 1000); // 5 secs
    }

    await this.sanitizeTimers();
  }

  async clearTimers(): Promise<void> {
    if (this.updateTimerID) {
      clearInterval(this.updateTimerID);
      this.updateTimerID = undefined;
    }

    // and now the array of timers...
    while (this.timers.length > 0) {
      const inter = this.timers.pop();
      clearInterval(inter);
    }
  }

  async sanitizeTimers(): Promise<void> {
    this.timers = this.timers.filter((t) => {
      if (this.updateTimerID && t === this.updateTimerID) return true;
      clearInterval(t);
      return false;
    });
  }

  static async doSave() {
    try {
      const syncstr: string = await native.check_save_error();
      console.log(`wallet check saved: ${syncstr}`);
      return syncstr;
    } catch (error: any) {
      console.error(`Critical Error check save wallet ${error}`);
      return error;
    }
  }

  static async deinitialize() {
    try {
      const str: string = await native.deinitialize();
      console.log(`Deinitialize status: ${str}`);
    } catch (error) {
      console.error(`Critical Error de-initialize ${error}`);
    }
  }

  static async getWalletVersion(): Promise<number | undefined> {
    try {
      const walletVersionStr: string = await native.get_wallet_version();
      if (!walletVersionStr) {
        console.error("Internal Error wallet version");
        return;
      }
      const walletVersionJSON = JSON.parse(walletVersionStr);

      return walletVersionJSON.read_version;
    } catch (error) {
      console.error(`Critical Error wallet version ${error}`);
      return;
    }
  }

  // Shield the transparent balance to Orchard. Throws on any failure (empty
  // result, parse error, or a `{ error }` from propose/confirm); the thrown
  // message is the error text. Returns the comma-joined txids on success. No
  // "Error:" prose ever crosses on the data channel — the caller's catch turns
  // a throw into its own error surface.
  async shieldTransparentBalanceToOrchard(): Promise<string> {
    // PROPOSING
    const shieldResult: string = await native.shield();
    if (!shieldResult) throw new Error("internal error: empty shield result");
    const shieldJSON: { fee?: number; error?: string } = JSON.parse(shieldResult);
    if (shieldJSON.error) throw new Error(`shield: ${shieldJSON.error}`);

    // SHIELDING
    const confirmResult: string = await native.confirm();
    if (!confirmResult) throw new Error("internal error: empty confirm result");
    const confirmJSON: { txids?: string[]; error?: string } = JSON.parse(confirmResult);
    if (confirmJSON.error) throw new Error(`confirm: ${confirmJSON.error}`);
    if (confirmJSON.txids && confirmJSON.txids.length > 0) {
      return confirmJSON.txids.join(", ");
    }
    throw new Error(`unexpected confirm result: ${JSON.stringify(confirmJSON)}`);
  }

  // Special method to get the Info object. This is used both internally and by the Loading screen
  static async getInfoObject(): Promise<InfoClass> {
    try {
      const infostr: string = await native.info_server();
      if (!infostr) {
        console.log("server info Failed", infostr);
        // Empty server info (e.g. offline): keep the Ironwood banners from the
        // local reads.
        const offlineInfo = new InfoClass(infostr);
        await RPC.populateLocalIronwoodFields(offlineInfo);
        return offlineInfo;
      }
      const infoJSON: RPCInfoType = JSON.parse(infostr);

      const info = new InfoClass();
      info.chainName = infoJSON.chain_name;
      info.latestBlock = infoJSON.latest_block_height;
      info.connections = 1;
      info.serverUri = infoJSON.server_uri;
      info.version = `${infoJSON.vendor}/${infoJSON.git_commit ? infoJSON.git_commit.substring(0, 6) : ""}/${infoJSON.version}`;
      info.zcashdVersion = "Not Available";
      info.currencyName = info.chainName === ServerChainNameEnum.mainChainName ? "ZEC" : "TAZ";
      info.solps = 0;

      // ZEC price is not fetched at all: the clearnet fetch is removed until
      // the mixnet convergence lands a typed price surface (ADR 0024 arc 6).
      // The UI renders its `USD --` fallback meanwhile.

      // zingolib version
      let zingolibStr: string = await native.get_version();
      if (!zingolibStr) {
        zingolibStr = "<none>";
      }
      info.zingolib = zingolibStr;

      // Wallet height, Ironwood activation, drain plan and migration progress —
      // all LOCAL reads, so the Dashboard's Ironwood banners survive offline.
      await RPC.populateLocalIronwoodFields(info);

      return info;
    } catch (err) {
      console.error("Error: to parse info ", err);
      // Offline / server-info failure still keeps the Ironwood banners: they run
      // on LOCAL wallet state, not server facts. Guard so a local-read hiccup
      // can't mask the original error path.
      const info = new InfoClass("Error: to parse info " + err);
      try {
        await RPC.populateLocalIronwoodFields(info);
      } catch (e) {
        console.error("Error populating local Ironwood fields", e);
      }
      return info;
    }
  }

  // Fill every LOCAL Ironwood field (no network): wallet height, activation
  // height, the drain plan, and migration progress. Split out and called in
  // every getInfoObject path so BOTH Dashboard banners — the pre-migration
  // "Migrate / Simulate" prompt and the "Migration in progress" banner —
  // survive an offline info_server failure. Being offline only means batches
  // can't broadcast and the server tip is unknown, not that this local state
  // vanished.
  static async populateLocalIronwoodFields(info: InfoClass): Promise<void> {
    info.walletHeight = await RPC.fetchWalletHeight();
    // NU6.3 / Ironwood activation height, read from zingolib (source of truth).
    info.nu63ActivationHeight = await RPC.fetchIronwoodActivationHeight();
    // Happy-path drain plan: how much Orchard can move vs is stranded dust.
    const drainPlan = await RPC.fetchOrchardDrainPlan();
    info.orchardMigratable = drainPlan.migratable;
    info.orchardDust = drainPlan.dust;
    info.orchardFee = drainPlan.fee;
    await RPC.populateMigrationFields(info);
  }

  // Fill the Dashboard migration-progress fields from the LOCAL migration_status
  // read (no network). No-op (banner hidden) when none is running.
  static async populateMigrationFields(info: InfoClass): Promise<void> {
    const migStatus = await RPC.fetchMigrationStatus();
    if (!migStatus) return;
    info.migrationInProgress = true;
    // Complete lingers as phase "complete" until dismissed (cancelIronwoodMigration).
    info.migrationComplete = migStatus.phase?.kind === "complete";
    info.migrationBatchesConfirmed = migStatus.parts_confirmed;
    info.migrationBatchesTotal = migStatus.parts_total;
    // Pending = what is still spendable in the Orchard pool (ZIP 318's figure).
    // NOT value_total − value_migrated: value_migrated is the whole Ironwood
    // balance (includes earlier migrations), so that subtraction goes negative
    // and clamps to 0.
    info.migrationPendingZec = migStatus.orchard_confirmed_spendable / 10 ** 8;
    // Blocks until the next scheduled window opens (block-based, like mobile).
    // Needs a live chain tip; offline (latestBlock 0) we omit it, so the banner
    // falls back to "sending automatically" instead of a bogus count.
    info.migrationNextBlocks =
      info.latestBlock > 0 && migStatus.next_wakes.length
        ? Math.max(0, migStatus.next_wakes[0].boundary - info.latestBlock)
        : 0;
  }

  static async setWalletSettingOption(name: string, value: string): Promise<string> {
    const r: string = await native.set_option_wallet();

    return r;
  }

  async fetchInfo(): Promise<void> {
    const info: InfoClass = await RPC.getInfoObject();

    this.fnSetInfo(info);
  }

  async getWalletSaveRequired(): Promise<boolean> {
    try {
      const walletSaveRequiredStr: string = await native.get_wallet_save_required();
      if (!walletSaveRequiredStr) {
        console.error("Internal Error wallet save required");
        return false;
      }
      const walletSaveRequiredJSON = JSON.parse(walletSaveRequiredStr);

      return walletSaveRequiredJSON.save_required;
    } catch (error) {
      console.error(`Critical Error wallet save required ${error}`);
      return false;
    }
  }

  async fetchSyncPoll(): Promise<void> {
    try {
      // A failed poll rejects (typed error on the throw channel); the catch
      // below records it as lastPollSyncError. Status replies ("not launched",
      // "not complete") and the completed JSON still cross on the data channel.
      const returnPoll: string = await native.poll_sync();

      if (returnPoll.toLowerCase().startsWith("sync task has not been launched")) {
        console.log("SYNC POLL -> RUN SYNC", returnPoll);
        void this.refreshSync();
        return;
      }

      if (returnPoll.toLowerCase().startsWith("sync task is not complete")) {
        console.log("SYNC POLL -> FETCH STATUS", returnPoll);
        void this.fetchSyncStatus();
        console.log("SYNC POLL -> RUN SYNC", returnPoll);
        // I don't trust in this message, when the tx is stuck in Trasmitted
        // this is the message I got & after that the status says 100% complete
        // this is not true, here Just in case, I need to run the sync again.
        void this.refreshSync();
        return;
      }

      let sp;
      try {
        sp = JSON.parse(returnPoll);
      } catch (error) {
        console.error("SYNC POLL ERROR - PARSE JSON", returnPoll, error);
        return;
      }

      console.log("SYNC POLL", sp);

      console.log("SYNC POLL -> FETCH STATUS");
      void this.fetchSyncStatus();
    } catch (error) {
      console.error(`Critical Error sync poll ${error}`);
      this.lastPollSyncError = `${error}`;
    }
  }

  async refreshSync(fullRescan?: boolean): Promise<void> {
    try {
      // This is async, so when it is done, we finish the refresh.
      if (fullRescan) {
        await this.clearTimers();
        // clean the ValueTransfer list before.
        this.fnSetValueTransfersList([]);
        this.fnSetMessagesList([]);
        this.fnSetTotalBalance({
          totalOrchardBalance: 0,
          totalIronwoodBalance: 0,
          totalSaplingBalance: 0,
          totalTransparentBalance: 0,
          confirmedTransparentBalance: 0,
          confirmedOrchardBalance: 0,
          confirmedIronwoodBalance: 0,
          confirmedSaplingBalance: 0,
          totalSpendableBalance: 0,
        } as TotalBalanceClass);
        this.fnSetSyncStatus({});
        this.fnSetVerificationProgress(null);

        // the rescan in zingolib do two tasks:
        // 1. stop the sync.
        // 2. launch the rescan.
        // A failed rescan rejects (typed error on the throw channel), caught below.
        await native.run_rescan();
        await this.configure();
      } else {
        // A concurrent launch now returns a clean "already running" status (no
        // longer an error); the existing sync just keeps going. A genuine
        // failure rejects and is caught below.
        const syncStr: string = await native.run_sync();
        console.log(`Sync: ${syncStr}`);
      }
    } catch (error) {
      console.error(`Critical Error run sync/rescan ${error}`);
    }
  }

  async fetchSyncStatus(): Promise<void> {
    try {
      // A failed status rejects (typed error on the throw channel), caught below.
      const returnStatus: string = await native.status_sync();
      let ss = {} as SyncStatusType;
      try {
        ss = JSON.parse(returnStatus);
        ss.lastError = this.lastPollSyncError;
      } catch (error) {
        console.error("SYNC STATUS ERROR - PARSE JSON", returnStatus, error);
        return;
      }

      // avoiding 0.00, minimum 0.01, maximun 100
      // fixing when is:
      // - 0.00000000123 (rounded 0)     better: 0.01  than 0
      // - 99.9999999123 (rounded 99.99) better: 99.99 than 100.
      ss.percentage_total_outputs_scanned =
        ss.percentage_total_outputs_scanned && ss.percentage_total_outputs_scanned < 0.01
          ? 0.01
          : ss.percentage_total_outputs_scanned &&
              ss.percentage_total_outputs_scanned > 99.99 &&
              ss.percentage_total_outputs_scanned < 100
            ? 99.99
            : Number(ss.percentage_total_outputs_scanned?.toFixed(2));

      ss.percentage_total_blocks_scanned =
        ss.percentage_total_blocks_scanned && ss.percentage_total_blocks_scanned < 0.01
          ? 0.01
          : ss.percentage_total_blocks_scanned &&
              ss.percentage_total_blocks_scanned > 99.99 &&
              ss.percentage_total_blocks_scanned < 100
            ? 99.99
            : Number(ss.percentage_total_blocks_scanned?.toFixed(2));

      console.log("SYNC STATUS", ss);
      console.log(
        "SYNC STATUS",
        ss.scan_ranges?.length,
        ss.percentage_total_outputs_scanned,
        ss.percentage_total_blocks_scanned,
      );

      // store SyncStatus object for a new screen
      this.fnSetSyncStatus(ss);
      this.fnSetVerificationProgress(ss.percentage_total_outputs_scanned ?? ss.percentage_total_blocks_scanned ?? 0);
    } catch (error) {
      console.error(`Critical Error sync status ${error}`);
    }
  }

  async zingolibValueTransfers(): Promise<RPCValueTransferType[]> {
    try {
      // fetch value transfers
      const txValueTransfersStr: string = await native.get_value_transfers();
      if (!txValueTransfersStr) {
        console.error("Internal Error txs ValueTransfers");
        this.fnSetFetchError("ValueTransfers", "Internal RPC Error");
        return [];
      }
      const txValueTransfersJSON = JSON.parse(txValueTransfersStr);

      return txValueTransfersJSON.value_transfers;
    } catch (error) {
      this.fnSetFetchError("ValueTransfers", `Critical Error value transfers ${error}`);
      console.error(`Critical Error value transfers ${error}`);
      return [];
    }
  }

  async zingolibMessages(): Promise<RPCValueTransferType[]> {
    try {
      // fetch value transfers
      const txMessagesStr: string = await native.get_messages("");
      if (!txMessagesStr) {
        console.error("Internal Error txs Messages");
        this.fnSetFetchError("Messages", "Internal RPC Error");
        return [];
      }
      const txMessagesJSON = JSON.parse(txMessagesStr);

      return txMessagesJSON.value_transfers;
    } catch (error) {
      this.fnSetFetchError("Messages", `Critical Error messages ${error}`);
      console.error(`Critical Error messages ${error}`);
      return [];
    }
  }

  // This method will get the total balances
  async fetchTotalBalance() {
    try {
      const spendableStr: string = await native.get_spendable_balance_total();
      let spendableJSON;
      if (!spendableStr) {
        console.error("Internal Error spendable balance");
      } else {
        spendableJSON = JSON.parse(spendableStr);
      }

      const balanceStr: string = await native.get_balance();
      if (!balanceStr) {
        console.error("Internal Error balance");
        this.fnSetFetchError("balance", "Internal RPC Error");
      }
      const balanceJSON = JSON.parse(balanceStr);

      // Total Balance
      const balance: TotalBalanceClass = {
        totalOrchardBalance: (balanceJSON.total_orchard_balance || 0) / 10 ** 8,
        totalIronwoodBalance: (balanceJSON.total_ironwood_balance || 0) / 10 ** 8,
        totalSaplingBalance: (balanceJSON.total_sapling_balance || 0) / 10 ** 8,
        totalTransparentBalance: (balanceJSON.total_transparent_balance || 0) / 10 ** 8,
        confirmedOrchardBalance: (balanceJSON.confirmed_orchard_balance || 0) / 10 ** 8,
        confirmedIronwoodBalance: (balanceJSON.confirmed_ironwood_balance || 0) / 10 ** 8,
        confirmedSaplingBalance: (balanceJSON.confirmed_sapling_balance || 0) / 10 ** 8,
        confirmedTransparentBalance: (balanceJSON.confirmed_transparent_balance || 0) / 10 ** 8,
        // header total balance
        totalSpendableBalance: (spendableJSON.spendable_balance || 0) / 10 ** 8,
        //totalSpendableBalance: ((balanceJSON.confirmed_orchard_balance + balanceJSON.confirmed_sapling_balance) || 0) / 10 ** 8,
      };

      this.fnSetTotalBalance(balance);
    } catch (error) {
      this.fnSetFetchError("balance", `Critical Error balance ${error}`);
      console.error(`Critical Error balance ${error}`);
    }
  }

  async fetchAddresses() {
    try {
      // UNIFIED
      const unifiedAddressesStr: string = await native.get_unified_addresses();
      if (!unifiedAddressesStr) {
        console.error("Internal Error addresses");
        return;
      }
      const unifiedAddressesJSON: UnifiedAddressClass[] = JSON.parse(unifiedAddressesStr) || [];

      // TRANSPARENT
      const transparentAddressStr: string = await native.get_transparent_addresses();
      if (!transparentAddressStr) {
        console.error("Internal Error addresses");
        return;
      }
      const transparentAddressesJSON: TransparentAddressClass[] = JSON.parse(transparentAddressStr) || [];

      this.fnSetAddressesUnified(unifiedAddressesJSON);
      this.fnSetAddressesTransparent(transparentAddressesJSON);
    } catch (error) {
      console.error(`Critical Error addresses ${error}`);
      // relaunch the interval tasks just in case they are aborted.
      return;
    }
  }

  // Throws on failure; the caller catches. o = orchard, z = sapling, oz = both.
  static async createNewAddressUnified(type: string): Promise<string> {
    return native.create_new_unified_address(type);
  }

  // Throws on failure; the caller catches. t = transparent.
  static async createNewAddressTransparent(): Promise<string> {
    return native.create_new_transparent_address();
  }

  static async fetchWalletHeight(): Promise<number> {
    try {
      const heightStr: string = await native.get_latest_block_wallet();
      const heightJSON = JSON.parse(heightStr);

      return heightJSON.height;
    } catch (error) {
      console.error(`Critical Error wallet height ${error}`);
      return 0;
    }
  }

  // NU6.3 / Ironwood activation height for the wallet's chain (0 if unknown).
  // Native returns the height as a plain string.
  static async fetchIronwoodActivationHeight(): Promise<number> {
    try {
      const heightStr: string = await native.get_ironwood_activation_height();
      const height = Number(heightStr);
      return Number.isFinite(height) ? height : 0;
    } catch (error) {
      console.error(`Error ironwood activation height ${error}`);
      return 0;
    }
  }

  // Happy-path Orchard→Ironwood drain plan (plan_orchard_drain): read-only, no
  // sync. Returns migratable/dust in ZEC (both 0 on error). migratable 0 with an
  // Orchard balance means the whole balance is dust.
  static async fetchOrchardDrainPlan(): Promise<{ migratable: number; dust: number; fee: number }> {
    try {
      const str: string = await native.plan_orchard_drain();
      const json = JSON.parse(str);
      // Failures now cross as `{ error }` JSON; migratable -1 is the caller's
      // error sentinel.
      if (json.error) {
        console.error(`Error orchard drain plan: ${json.error}`);
        return { migratable: -1, dust: 0, fee: 0 };
      }
      return {
        migratable: (json.migrated || 0) / 10 ** 8,
        dust: (json.stranded || 0) / 10 ** 8,
        fee: (json.fee || 0) / 10 ** 8,
      };
    } catch (error) {
      console.error(`Error orchard drain plan ${error}`);
      return { migratable: -1, dust: 0, fee: 0 };
    }
  }

  // Live progress of an in-flight immediate drain (built/sent of total, phase),
  // polled by the "executing" screen. Null when no drain is running. Reads a
  // lock-free side channel, so it works while the drain holds the wallet lock.
  static async drainStatus(): Promise<{ total: number; built: number; sent: number; phase: string } | null> {
    try {
      const s = JSON.parse(await native.drain_status());
      return s.idle ? null : s;
    } catch (error) {
      console.error(`Error drain status ${error}`);
      return null;
    }
  }

  // Fetch all T and Z and O value transfers
  private async fetchValueTransferData(
    fetchLabel: string,
    fetcher: () => Promise<RPCValueTransferType[]>,
    setter: (list: ValueTransferClass[]) => void,
  ): Promise<void> {
    try {
      let latestBlockHeight: number = 0;
      const heightStr: string = await native.get_latest_block_server(this.currentWallet ? this.currentWallet.uri : "");
      if (!heightStr) {
        console.error("Internal Error server height");
      } else {
        latestBlockHeight = Number(heightStr);
      }

      const txsJSON: RPCValueTransferType[] = await fetcher();
      const walletHeight: number = await RPC.fetchWalletHeight();

      const list: ValueTransferClass[] = txsJSON.map((tx: RPCValueTransferType) => {
        const vt: ValueTransferClass = {} as ValueTransferClass;

        vt.txid = tx.txid;
        vt.time = tx.datetime;
        vt.type = tx.kind;
        vt.fee = (!tx.transaction_fee ? 0 : tx.transaction_fee) / 10 ** 8;
        vt.zec_price = !tx.zec_price ? 0 : tx.zec_price;

        // unconfirmed means 0 confirmations, the tx is mining already.
        // 'pending' is obsolete
        if (
          tx.status === ValueTransferStatusEnum.calculated ||
          tx.status === ValueTransferStatusEnum.transmitted ||
          tx.status === ValueTransferStatusEnum.mempool ||
          tx.status === ValueTransferStatusEnum.failed
        ) {
          vt.confirmations = 0;
        } else if (tx.status === ValueTransferStatusEnum.confirmed) {
          vt.confirmations =
            latestBlockHeight && latestBlockHeight >= walletHeight
              ? latestBlockHeight - tx.blockheight + 1
              : walletHeight - tx.blockheight + 1;
        } else {
          // impossible case
          vt.confirmations = 0;
        }

        vt.blockheight = tx.blockheight;
        vt.status = tx.status;

        if (tx.status === ValueTransferStatusEnum.failed) {
          console.log("[RPC] failed value transfer (raw):", tx);
        }
        vt.address = !tx.recipient_address ? undefined : tx.recipient_address;
        vt.amount = (!tx.value ? 0 : tx.value) / 10 ** 8;
        vt.memos = !tx.memos || tx.memos.length === 0 ? undefined : tx.memos;
        vt.poolsSentFrom = parseValueTransferPools(tx.pools_sent_from);
        vt.poolsReceived = parseValueTransferPools(tx.pools_received);

        // An Orchard -> Ironwood migration part is a self-send funded from
        // Orchard and received into Ironwood. zingolib does not model it as its
        // own kind: it crosses as `send-to-self` OR `memo-to-self` (the parts
        // carry a memo), and its received pools are BOTH Ironwood (the migrated
        // denomination) and Orchard (the change), so key off the Ironwood
        // receipt from an Orchard source and surface it as its own type.
        if (
          (vt.type === ValueTransferKindEnum.sendToSelf || vt.type === ValueTransferKindEnum.memoToSelf) &&
          !!vt.poolsSentFrom?.includes(ValueTransferPoolEnum.orchard) &&
          !!vt.poolsReceived?.includes(ValueTransferPoolEnum.ironwood)
        ) {
          vt.type = ValueTransferKindEnum.migration;
        }

        if (vt.status === ValueTransferStatusEnum.failed) {
          console.log("[RPC] failed value transfer (transformed):", vt);
        }

        return vt;
      });

      setter(list);
    } catch (error) {
      console.error(`Critical Error ${fetchLabel.toLowerCase()} ${error}`);
    }
  }

  async fetchTandZandOValueTransfers() {
    await this.fetchValueTransferData(
      "ValueTransfers",
      () => this.zingolibValueTransfers(),
      (list) => this.fnSetValueTransfersList(list),
    );
  }

  async fetchTandZandOMessages() {
    await this.fetchValueTransferData(
      "Messages",
      () => this.zingolibMessages(),
      (list) => this.fnSetMessagesList(list),
    );
  }

  // Send a transaction using the already constructed sendJson structure
  async sendTransaction(sendJson: Array<SendJsonToTypeType>): Promise<string> {
    // clear the timers - Tasks.
    await this.clearTimers();
    // sending
    let sendError: string = "";
    let sendTxids: string = "";
    try {
      // creating the propose
      const proposeStr: string = await native.send(JSON.stringify(sendJson));
      if (!proposeStr) {
        console.error("Internal Error propose");
        sendError = "Internal RPC Error: propose";
      }
      if (!sendError) {
        const proposeJSON: SendProposeType = JSON.parse(proposeStr);
        if (proposeJSON.error) {
          console.error(`Error propose ${proposeJSON.error}`);
          sendError = proposeJSON.error;
        }
        if (!sendError) {
          // creating the transaction
          const sendStr: string = await native.confirm();
          if (!sendStr) {
            console.error("Internal Error confirm");
            sendError = "Internal RPC Error: confirm";
          }
          if (!sendError) {
            const sendJSON: SendType = JSON.parse(sendStr);
            if (sendJSON.error) {
              console.error(`Error confirm ${sendJSON.error}`);
              sendError = sendJSON.error;
            } else if (sendJSON.txids && sendJSON.txids.length > 0) {
              sendTxids = sendJSON.txids.join(", ");
            }
          }
        }
      }
    } catch (error) {
      console.error(`Critical Error send ${error}`);
      sendError = `Error: send ${error}`;
    }

    // create the tasks
    await this.configure();

    if (sendTxids) {
      return sendTxids;
    }
    if (sendError) {
      throw new Error(sendError);
    }
    throw new Error("send returned neither txids nor error");
  }

  // Polls poll_sync until the sync task is no longer running (or a timeout).
  // "Sync task is not complete." is zingolib's only "still running" reply; any
  // other reply (no handle, or a completed JSON result) means it has stopped.
  private async waitForSyncStopped(timeoutMs = 30000, intervalMs = 200): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      let poll: string;
      try {
        poll = await native.poll_sync();
      } catch {
        return;
      }
      if (!poll || !poll.toLowerCase().startsWith("sync task is not complete")) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  // Happy-path Ironwood migration: one-shot drain of all pre-Ironwood Orchard
  // notes into the Ironwood pool. The zingolib drain syncs internally
  // (sync_and_await), which requires no sync running — so we stop our 5s loop
  // and the in-flight sync, wait until it is actually stopped, drain, then
  // resume the loop (mirrors how sendTransaction brackets a spend).
  async drainOrchardToIronwood(): Promise<{ result: RPCIronwoodDrainType | null; error: string }> {
    await this.clearTimers();
    try {
      await native.stop_sync();
      await this.waitForSyncStopped();

      const resultStr: string = await native.drain_orchard_to_ironwood();
      if (resultStr) {
        const resultJSON: RPCIronwoodDrainType & { error?: string } = JSON.parse(resultStr);
        // Failures now cross as `{ error }` JSON alongside the success shape.
        if (resultJSON.error) {
          console.error(`Error drain orchard to ironwood: ${resultJSON.error}`);
          return { result: null, error: resultJSON.error };
        }
        return { result: resultJSON, error: "" };
      }
      return { result: null, error: "Error: Internal RPC Error: drain orchard to ironwood" };
    } catch (error) {
      console.error(`Critical error drain orchard to ironwood: ${error}`);
      return { result: null, error: `Error: ${error}` };
    } finally {
      // Always resume the background sync loop.
      await this.configure();
    }
  }

  // ---- Private (scheduled) Ironwood migration (zingolib parts/buckets) ----
  // Foreground-only: zingo-pc drives the schedule while the app is open. Each
  // native call throws a typed error on failure; these wrappers swallow it into
  // a null / false / [] so callers branch on data, never on an "Error:" string.

  // The immediate one-call private migration: split notes into standard
  // denominations then send every part to Ironwood. Like drainOrchardToIronwood,
  // it syncs internally, so we stop our 5s loop, run it, and resume. Long-
  // running: splitting happens in rounds, each waiting for confirmation.
  async migrateToIronwood(): Promise<{ result: FfiMigrationSummary | null; error: string }> {
    await this.clearTimers();
    try {
      const resultStr: string = await native.migrate_to_ironwood();
      if (resultStr) {
        const resultJSON: FfiMigrationSummary & { error?: string } = JSON.parse(resultStr);
        if (resultJSON.error) {
          console.error(`Error migrate to ironwood: ${resultJSON.error}`);
          return { result: null, error: resultJSON.error };
        }
        return { result: resultJSON, error: "" };
      }
      return { result: null, error: "Error: Internal RPC Error: migrate to ironwood" };
    } catch (error) {
      console.error(`Critical error migrate to ironwood: ${error}`);
      return { result: null, error: `Error: ${error}` };
    } finally {
      // Always resume the background sync loop.
      await this.configure();
    }
  }

  // The Phase 1 split plan the user consents to. Null on any failure (e.g. no
  // migratable Orchard, or the chain not yet at NU6.3).
  static async planIronwoodMigration(): Promise<FfiPlan | null> {
    try {
      return JSON.parse(await native.plan_ironwood_migration());
    } catch (error) {
      console.error(`Error plan ironwood migration ${error}`);
      return null;
    }
  }

  // The migration's progress. Null when none is in progress or on failure.
  static async fetchMigrationStatus(): Promise<FfiStatus | null> {
    try {
      const status: FfiStatus = JSON.parse(await native.migration_status());
      return status.in_progress ? status : null;
    } catch (error) {
      console.error(`Error migration status ${error}`);
      return null;
    }
  }

  // Begin the migration with the consented plan hash. per_bucket <= 0 = default.
  static async startIronwoodMigration(consentedPlanHash: string, perBucket: number): Promise<boolean> {
    try {
      await native.start_ironwood_migration(consentedPlanHash, perBucket);
      return true;
    } catch (error) {
      console.error(`Error start ironwood migration ${error}`);
      return false;
    }
  }

  // Drive ONE step of Phase 1 note-splitting. The FFI throws on failure (typed
  // error), so we catch and surface the text in `error` — the driving loop then
  // stops and offers Retry (the state is reconcilable; retry re-enters the loop).
  // `step` is null exactly when `error` is set.
  static async continueNoteSplitting(): Promise<{ step: FfiSplitStep | null; error: string }> {
    try {
      const step: FfiSplitStep = JSON.parse(await native.continue_note_splitting());
      return { step, error: "" };
    } catch (error) {
      console.error(`Error continue note splitting ${error}`);
      return { step: null, error: `${error}` };
    }
  }

  // Re-cadence the schedule (parts per broadcast window). Only valid between
  // consent and the first signed part; afterwards the FFI throws (CadenceFixed).
  static async rescheduleParts(perBucket: number): Promise<boolean> {
    try {
      await native.reschedule_parts(perBucket);
      return true;
    } catch (error) {
      console.error(`Error reschedule parts ${error}`);
      return false;
    }
  }

  // User-triggered "Send now": broadcast the open window's batch (plus any
  // windows missed while closed, which the engine folds in), sequencing sends
  // spacingMs apart. Returns the per-part BatchReport — unlike the automatic
  // driver this surfaces per-part failure reasons instead of leaving a rejected
  // part silently signed. Disclosed path (the correlation notice is shown at the
  // cadence choice).
  static async executeDueParts(spacingMs: number): Promise<{ report: FfiBatchReport | null; error: string }> {
    try {
      const report: FfiBatchReport = JSON.parse(await native.execute_due_parts(spacingMs));
      return { report, error: "" };
    } catch (error) {
      console.error(`Error execute due parts ${error}`);
      return { report: null, error: `${error}` };
    }
  }

  // Progress of the in-flight execute batch; null when none is running.
  static async executeDuePartsStatus(): Promise<{ total: number; sent: number } | null> {
    try {
      const j = JSON.parse(await native.execute_due_parts_status());
      return j.idle ? null : { total: j.total, sent: j.sent };
    } catch (error) {
      console.error(`Error execute due parts status ${error}`);
      return null;
    }
  }

  // Run on every launch: applies the safe-unattended reconciliation actions.
  // reconcile_migration throws "no migration in progress" when there is none —
  // the normal case — so gate on the status first instead of logging that as an
  // error every launch/wallet-switch.
  static async reconcileMigration(): Promise<void> {
    const status = await RPC.fetchMigrationStatus();
    if (!status) return;
    try {
      await native.reconcile_migration();
    } catch (error) {
      console.error(`Error reconcile migration ${error}`);
    }
  }

  // Send every part whose window is open now (the "Send batch" action).
  static async broadcastDueParts(): Promise<string[]> {
    try {
      return JSON.parse(await native.broadcast_due_parts()).txids ?? [];
    } catch (error) {
      console.error(`Error broadcast due parts ${error}`);
      return [];
    }
  }

  // Send parts from windows that already passed (needs user disclosure).
  static async catchUpMigration(): Promise<string[]> {
    try {
      return JSON.parse(await native.catch_up_migration()).txids ?? [];
    } catch (error) {
      console.error(`Error catch up migration ${error}`);
      return [];
    }
  }

  // Periodic driving-loop primitive: no-op without a migration; otherwise
  // refreshes part witnesses and broadcasts every part whose bucket window and
  // random target height are both reached. Called each sync cycle. This is the
  // WHOLE of Phase 2 — nothing else has to happen "when a batch's block
  // arrives"; the next sync tick's call fires the due parts.
  //
  // Logs the txids it broadcasts (so a batch send is visible) and surfaces
  // failures loudly instead of swallowing them — a silent no-op every tick and
  // a silent error every tick look identical otherwise.
  static async autoBroadcastIfDue(): Promise<void> {
    try {
      const txids: string[] = JSON.parse(await native.auto_broadcast_if_due()).txids ?? [];
      if (txids.length > 0) {
        console.log(`[migration] auto_broadcast_if_due sent ${txids.length} part(s):`, txids);
      }
    } catch (error) {
      console.error(`Error auto broadcast if due ${error}`);
    }
  }

  // reconcile_migration returning its applied/recommended actions (Debug
  // strings), for the driver's diagnostics. Does not sync; offline-safe.
  static async reconcileActions(): Promise<string[]> {
    try {
      return JSON.parse(await native.reconcile_migration()).actions ?? [];
    } catch (error) {
      console.error(`Error reconcile migration ${error}`);
      return [];
    }
  }

  // Guards against a slow drive step (proving + spaced sends can take many
  // seconds while holding the wallet lock) stacking across 5s ticks.
  static migrationDriveInFlight = false;

  // The foreground migration driver, run every sync cycle. It advances the
  // migration WITHOUT ever compromising the private path's privacy:
  //
  //   planned / note_splitting -> drive continue_note_splitting to completion.
  //     The migration screen also drives this, but the user may have navigated
  //     away mid-split; without this the split never finishes.
  //
  //   parts_scheduled -> auto_broadcast_if_due (on-time) + privacy-safe reconcile:
  //
  //     - auto_broadcast_if_due fires a part only when its OWN current window and
  //       random target are both reached — an on-time, uncorrelated broadcast
  //       that blends with the scheduled cadence. It never fires a past window.
  //
  //     - reconcile_migration (via reconcileActions) applies every UNATTENDED-safe
  //       fix each tick: promote confirmed, mark invalidated, mark complete, and —
  //       for missed windows — rebuild an expired part FORWARD into a fresh
  //       jittered window (schedule::place). That is the privacy-preserving
  //       recovery, broadcasting nothing correlated now.
  //
  //     - PromptCatchUp (windows that passed while closed with parts still
  //       Assigned) is deliberately NOT auto-sent: broadcasting at app-open time
  //       correlates the batch with the user's activity, which needs the ZIP 318
  //       disclosure. That is the user-triggered executeDueParts ("Send now"),
  //       never an automatic burst. The driver only logs it.
  //
  // Gated on an in-progress migration so reconcile doesn't throw NoMigration
  // (and spam) on every idle tick.
  static async driveMigration(): Promise<void> {
    if (RPC.migrationDriveInFlight) return;
    const status = await RPC.fetchMigrationStatus();
    if (!status) return;
    const phase = status.phase?.kind;

    RPC.migrationDriveInFlight = true;
    try {
      if (phase === "planned" || phase === "note_splitting") {
        const { step, error } = await RPC.continueNoteSplitting();
        console.log(`[migration] phase=${phase} split=${error ? `error: ${error}` : (step?.step ?? "?")}`);
        return;
      }

      if (phase === "parts_scheduled") {
        // On-time, uncorrelated broadcasts only.
        await RPC.autoBroadcastIfDue();
        // Apply privacy-safe unattended fixes (promote / rebuild-forward / complete).
        const actions = await RPC.reconcileActions();
        if (actions.some((a) => a.includes("PromptCatchUp"))) {
          // Windows were missed while closed with parts still Assigned. We do NOT
          // send them here: broadcasting at app-open time correlates the late
          // batch with the user's activity (ZIP 318). That is the user-triggered
          // "Send now" (executeDueParts). Expired parts are already re-placed
          // forward by reconcile's Rebuild.
          console.log(
            `[migration] ${status.parts_confirmed}/${status.parts_total} confirmed — ` +
              `missed window(s) await the user's disclosed "Send now" (execute_due_parts).`,
          );
        }
      }
    } finally {
      RPC.migrationDriveInFlight = false;
    }
  }

  // Abandon the in-progress migration.
  static async cancelIronwoodMigration(): Promise<boolean> {
    try {
      await native.cancel_ironwood_migration();
      return true;
    } catch (error) {
      console.error(`Error cancel ironwood migration ${error}`);
      return false;
    }
  }

  setCurrentWallet(cw: WalletType) {
    this.currentWallet = cw;
  }
}
