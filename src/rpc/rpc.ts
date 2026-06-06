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
  WalletType,
  ServerChainNameEnum,
} from "../components/appstate";

import { native, ipcRenderer } from "../electronBridge";
import { RPCInfoType } from "./components/RPCInfoType";
import { RPCValueTransferType } from "./components/RPCValueTransferType";

export default class RPC {
  fnSetTotalBalance: (tb: TotalBalanceClass) => void;
  fnSetAddressesUnified: (abs: UnifiedAddressClass[]) => void;
  fnSetAddressesTransparent: (abs: TransparentAddressClass[]) => void;
  fnSetValueTransfersList: (t: ValueTransferClass[]) => void;
  fnSetMessagesList: (t: ValueTransferClass[]) => void;
  fnSetInfo: (info: InfoClass) => void;
  fnSetZecPrice: (p?: number, viaTor?: boolean) => void;
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
    fnSetZecPrice: (p?: number, viaTor?: boolean) => void,
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
    this.fnSetZecPrice = fnSetZecPrice;
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
      this.getZecPrice(),
      RPC.doSave(),
      this.fetchTandZandOValueTransfers(),
      this.fetchTandZandOMessages(),
    ]);
  }

  async configure(): Promise<void> {
    // takes a while to start
    await this.fetchTandZandOValueTransfers();
    await this.fetchAddresses();
    await this.fetchTotalBalance();
    await this.fetchInfo();
    void this.getZecPrice();
    await this.fetchTandZandOMessages();

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
      if (walletVersionStr) {
        if (walletVersionStr.toLowerCase().startsWith("error")) {
          console.error(`Error wallet version ${walletVersionStr}`);
          return;
        }
      } else {
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

  // shield transparent balance to orchard
  async shieldTransparentBalanceToOrchard(): Promise<string> {
    try {
      // PROPOSING
      const shieldResult: string = await native.shield();
      if (shieldResult) {
        if (shieldResult.toLowerCase().startsWith("error")) {
          // error
          console.error(`Error shield ${shieldResult}`);
          return shieldResult;
        }
      } else {
        // error empty
        const err = "Error: Internal error shield";
        console.log(err);
        return err;
      }
      let shieldJSON = {} as { fee: number; error: string };
      try {
        shieldJSON = JSON.parse(shieldResult);
      } catch (error: any) {
        const err = `Error: parsing shield result ${error.message}`;
        console.log(err);
        return err;
      }
      if (shieldJSON.error) {
        const err = `Error: shield ${shieldJSON.error}`;
        console.log(err);
        return err;
      }

      // SHIELDING
      const confirmResult: string = await native.confirm();
      if (confirmResult) {
        if (confirmResult.toLowerCase().startsWith("error")) {
          // error
          console.error(`Error Shield Confirm ${confirmResult}`);
          return confirmResult;
        }
      } else {
        // error empty
        const err = "Error: Internal error confirm";
        console.log(err);
        return err;
      }
      let confirmJSON = {} as { txids: string[]; error: string };
      try {
        confirmJSON = JSON.parse(confirmResult);
      } catch (error: any) {
        const err = `Error: parsing confirm result ${error.message}`;
        console.log(err);
        return err;
      }
      if (confirmJSON.error) {
        const err = `Error: confirm ${confirmJSON.error}`;
        console.log(err);
        return err;
      }
      if (confirmJSON.txids && confirmJSON.txids.length > 0) {
        const txids: string = confirmJSON.txids.join(", ");
        return txids;
      }

      // weird case, I want to see the JSON in the error.
      return JSON.stringify(confirmJSON);
    } catch (error) {
      const err = `Error: Critical Error shield/confirm ${error}`;
      console.log(err);
      return err;
    }
  }

  // Special method to get the Info object. This is used both internally and by the Loading screen
  static async getInfoObject(): Promise<InfoClass> {
    try {
      const infostr: string = await native.info_server();
      if (!infostr || infostr.toLowerCase().startsWith("error")) {
        console.log("server info Failed", infostr);
        return new InfoClass(infostr);
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

      // ZEC price is no longer fetched here — it lives outside InfoClass
      // (see `getZecPrice` below, scheduled by `runTaskPromises`). Folding
      // the price fetch into the info refresh meant that every 5s cycle
      // overwrote the Tor-fetched value with a hard-coded `false` HTTP call.

      // zingolib version
      let zingolibStr: string = await native.get_version();
      if (zingolibStr) {
        if (zingolibStr.toLowerCase().startsWith("error")) {
          zingolibStr = "<error>";
        }
      } else {
        zingolibStr = "<none>";
      }
      info.zingolib = zingolibStr;

      // we want to update the wallet last block
      const walletHeight: number = await RPC.fetchWalletHeight();
      info.walletHeight = walletHeight;

      return info;
    } catch (err) {
      console.error("Error: to parse info ", err);
      return new InfoClass("Error: to parse info " + err);
    }
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
      if (walletSaveRequiredStr) {
        if (walletSaveRequiredStr.toLowerCase().startsWith("error")) {
          console.error(`Error wallet save required ${walletSaveRequiredStr}`);
          return false;
        }
      } else {
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
      const returnPoll: string = await native.poll_sync();
      if (!returnPoll || returnPoll.toLowerCase().startsWith("error")) {
        console.error("SYNC POLL ERROR", returnPoll);
        this.lastPollSyncError = returnPoll;
        return;
      }

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
          totalSaplingBalance: 0,
          totalTransparentBalance: 0,
          confirmedTransparentBalance: 0,
          confirmedOrchardBalance: 0,
          confirmedSaplingBalance: 0,
          totalSpendableBalance: 0,
        } as TotalBalanceClass);
        this.fnSetSyncStatus({});
        this.fnSetVerificationProgress(null);

        // the rescan in zingolib do two tasks:
        // 1. stop the sync.
        // 2. launch the rescan.
        const rescanStr: string = await native.run_rescan();
        if (!rescanStr || rescanStr.toLowerCase().startsWith("error")) {
          console.error(`Error rescan ${rescanStr}`);
        }
        await this.configure();
      } else {
        const syncStr: string = await native.run_sync();
        if (!syncStr || syncStr.toLowerCase().startsWith("error")) {
          console.error(`Error sync ${syncStr}`);
        }
      }
    } catch (error) {
      console.error(`Critical Error run sync/rescan ${error}`);
    }
  }

  async fetchSyncStatus(): Promise<void> {
    try {
      const returnStatus: string = await native.status_sync();
      if (!returnStatus || returnStatus.toLowerCase().startsWith("error")) {
        console.error("SYNC STATUS ERROR", returnStatus);
        return;
      }
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
      if (txValueTransfersStr) {
        if (txValueTransfersStr.toLowerCase().startsWith("error")) {
          console.error(`Error txs ValueTransfers ${txValueTransfersStr}`);
          this.fnSetFetchError("ValueTransfers", txValueTransfersStr);
          return [];
        }
      } else {
        console.error("Internal Error txs ValueTransfers");
        this.fnSetFetchError("ValueTransfers", "Error: Internal RPC Error");
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
      if (txMessagesStr) {
        if (txMessagesStr.toLowerCase().startsWith("error")) {
          console.error(`Error txs Messages ${txMessagesStr}`);
          this.fnSetFetchError("Messages", txMessagesStr);
          return [];
        }
      } else {
        console.error("Internal Error txs Messages");
        this.fnSetFetchError("Messages", "Error: Internal RPC Error");
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
      if (spendableStr) {
        if (spendableStr.toLowerCase().startsWith("error")) {
          console.error(`Error spendable balance ${spendableStr}`);
        } else {
          spendableJSON = JSON.parse(spendableStr);
        }
      } else {
        console.error("Internal Error spendable balance");
      }

      const balanceStr: string = await native.get_balance();
      if (balanceStr) {
        if (balanceStr.toLowerCase().startsWith("error")) {
          console.error(`Error balance ${balanceStr}`);
          this.fnSetFetchError("balance", balanceStr);
        }
      } else {
        console.error("Internal Error balance");
        this.fnSetFetchError("balance", "Error: Internal RPC Error");
      }
      const balanceJSON = JSON.parse(balanceStr);

      // Total Balance
      const balance: TotalBalanceClass = {
        totalOrchardBalance: (balanceJSON.total_orchard_balance || 0) / 10 ** 8,
        totalSaplingBalance: (balanceJSON.total_sapling_balance || 0) / 10 ** 8,
        totalTransparentBalance: (balanceJSON.total_transparent_balance || 0) / 10 ** 8,
        confirmedOrchardBalance: (balanceJSON.confirmed_orchard_balance || 0) / 10 ** 8,
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
      if (unifiedAddressesStr) {
        if (unifiedAddressesStr.toLowerCase().startsWith("error")) {
          console.error(`Error addresses ${unifiedAddressesStr}`);
          return;
        }
      } else {
        console.error("Internal Error addresses");
        return;
      }
      const unifiedAddressesJSON: UnifiedAddressClass[] = JSON.parse(unifiedAddressesStr) || [];

      // TRANSPARENT
      const transparentAddressStr: string = await native.get_transparent_addresses();
      if (transparentAddressStr) {
        if (transparentAddressStr.toLowerCase().startsWith("error")) {
          console.error(`Error addresses ${transparentAddressStr}`);
          return;
        }
      } else {
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

  static async createNewAddressUnified(type: string) {
    try {
      // Zingolib creates addresses like this:
      // o = orchard only
      // z = sapling only
      // oz = orchard + sapling
      const addrStr: string = await native.create_new_unified_address(type);
      return addrStr;
    } catch (error) {
      const err = `Error: Critical Error new address U ${error}`;
      console.error(error);
      return err;
    }
  }

  static async createNewAddressTransparent() {
    try {
      // Zingolib creates Addresses like this:
      // t = transparent
      const addrStr: string = await native.create_new_transparent_address();
      return addrStr;
    } catch (error) {
      const err = `Error: Critical Error new address T ${error}`;
      console.log(err);
      return err;
    }
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

  // Fetch all T and Z and O value transfers
  private async fetchValueTransferData(
    fetchLabel: string,
    fetcher: () => Promise<RPCValueTransferType[]>,
    setter: (list: ValueTransferClass[]) => void,
  ): Promise<void> {
    try {
      let latestBlockHeight: number = 0;
      const heightStr: string = await native.get_latest_block_server(this.currentWallet ? this.currentWallet.uri : "");
      if (heightStr) {
        if (heightStr.toLowerCase().startsWith("error")) {
          this.fnSetFetchError(fetchLabel, `Error server height ${heightStr}`);
          console.error(`Error server height ${heightStr}`);
        } else {
          latestBlockHeight = Number(heightStr);
        }
      } else {
        console.error("Internal Error server height");
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
        vt.pool = !tx.pool_received ? undefined : tx.pool_received;

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
      if (proposeStr) {
        if (proposeStr.toLowerCase().startsWith("error")) {
          console.error(`Error propose ${proposeStr}`);
          sendError = proposeStr;
        }
      } else {
        console.error("Internal Error propose");
        sendError = "Error: Internal RPC Error: propose";
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
          if (sendStr) {
            if (sendStr.toLowerCase().startsWith("error")) {
              console.error(`Error confirm ${sendStr}`);
              sendError = sendStr;
            }
          } else {
            console.error("Internal Error confirm");
            sendError = "Error: Internal RPC Error: confirm";
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

  async getZecPrice() {
    // Read the user's "fetch price via Tor" preference from persisted
    // settings. Default off — if the key is missing or anything throws while
    // loading settings we keep the conventional HTTP path. The Tor client is
    // created lazily here only when Tor is requested.
    let withTor = false;
    let triedTor = false;
    try {
      const settings = await ipcRenderer.invoke("loadSettings");
      withTor = !!settings?.pricewithtor;
    } catch (e) {
      console.warn(`getZecPrice: could not load settings, falling back to HTTP. ${e}`);
    }

    if (withTor) {
      triedTor = true;
      try {
        const createRes: string = await native.create_tor_client();
        // Always dump what the native side actually returned so we can tell
        // a "client already exists" no-op from a real failure when the user
        // reports Tor not working.
        console.log("[Tor] create_tor_client returned:", JSON.stringify(createRes));
        if (createRes && createRes.toLowerCase().startsWith("error")) {
          if (!createRes.toLowerCase().includes("already")) {
            console.error(`[Tor] create failed, falling back to HTTP: ${createRes}`);
            withTor = false;
          } else {
            console.log("[Tor] client already exists — reusing");
          }
        }
      } catch (e) {
        console.error(`[Tor] create_tor_client threw, falling back to HTTP:`, e);
        withTor = false;
      }
    }

    try {
      const resultStr: string = await native.zec_price(withTor ? "true" : "false");
      console.log(`[Tor] zec_price(${withTor ? "true" : "false"}) returned:`, JSON.stringify(resultStr));

      if (resultStr) {
        if (resultStr.toLowerCase().startsWith("error")) {
          console.error(`[Tor] zec_price error: ${resultStr}`);
          // If Tor was attempted and the native side complained, retry over
          // plain HTTP so the user still sees a price. The dashboard
          // indicator will reflect that we did NOT use Tor for this value.
          if (withTor) {
            console.warn("[Tor] retrying without Tor after Tor-path failure");
            try {
              const fallback: string = await native.zec_price("false");
              console.log("[Tor] HTTP fallback returned:", JSON.stringify(fallback));
              if (fallback && !fallback.toLowerCase().startsWith("error")) {
                const json = JSON.parse(fallback);
                this.fnSetZecPrice(json.current_price, false);
                return;
              }
            } catch (e) {
              console.error(`[Tor] HTTP fallback also failed:`, e);
            }
          }
          this.fnSetZecPrice(0, false);
        } else {
          const resultJSON = JSON.parse(resultStr);
          // Reality, not intent: only mark as via-Tor if we actually went
          // through Tor for this fetch.
          this.fnSetZecPrice(resultJSON.current_price, triedTor && withTor);
        }
      } else {
        console.error(`[Tor] zec_price returned empty result`);
        this.fnSetZecPrice(0, false);
      }
    } catch (error) {
      console.error(`[Tor] zec_price threw:`, error);
    }
  }

  setCurrentWallet(cw: WalletType) {
    this.currentWallet = cw;
  }
}
