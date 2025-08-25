import {
  TotalBalanceClass,
  ValueTransferClass,
  InfoClass,
  UnifiedAddressClass,
  TransparentAddressClass,
  SyncStatusType,
  ServerClass,
  SendJsonToTypeType,
  SendProposeType,
  SendType,
  ValueTransferStatusEnum,
} from "../components/appstate";
import { ServerChainNameEnum } from "../components/appstate/enums/ServerChainNameEnum";

import native from "../native.node";
import { RPCInfoType } from "./components/RPCInfoType";

export default class RPC {
  fnSetTotalBalance: (tb: TotalBalanceClass) => void;
  fnSetAddressesUnified: (abs: UnifiedAddressClass[]) => void;
  fnSetAddressesTransparent: (abs: TransparentAddressClass[]) => void;
  fnSetValueTransfersList: (t: ValueTransferClass[]) => void;
  fnSetMessagesList: (t: ValueTransferClass[]) => void;
  fnSetInfo: (info: InfoClass) => void;
  fnSetZecPrice: (p?: number) => void;
  fnSetSyncStatus: (ss: SyncStatusType) => void;
  fnSetVerificationProgress: (verificationProgress: number | null) => void;
  fnSetFetchError: (command: string, error: string) => void;

  server: ServerClass;
  
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
    fnSetZecPrice: (p?: number) => void,
    fnSetSyncStatus: (ss: SyncStatusType) => void,
    fnSetVerificationProgress: (verificationProgress: number | null) => void,
    fnSetFetchError: (command: string, error: string) => void,
    server: ServerClass,
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

    this.server = server;

    this.lastBlockHeight = 0;

    this.updateTimerID = undefined;
    this.timers = [];

    this.lastPollSyncError = '';
  }

  async runTaskPromises(): Promise<void> {

    const taskPromises: Promise<void>[] = [];

    // do need this because of the sync process
    taskPromises.push(
      new Promise<void>(async resolve => {
        await this.fetchSyncPoll();
        //console.log('INTERVAL poll sync');
        resolve();
      }),
    );
    taskPromises.push(
      new Promise<void>(async resolve => {
        //const s = Date.now();
        await this.fetchInfo();
        //console.log('info & server height - ', Date.now() - s);
        resolve();
      }),
    );
    taskPromises.push(
      new Promise<void>(async resolve => {
        //const s = Date.now();
        await this.fetchAddresses();
        //console.log('addresses - ', Date.now() - s);
        resolve();
      }),
    );
    taskPromises.push(
      new Promise<void>(async resolve => {
        //const s = Date.now();
        await this.fetchTotalBalance();
        //console.log('balance - ', Date.now() - s);
        resolve();
      }),
    );
    // save the wallet as required.
    taskPromises.push(
      new Promise<void>(async resolve => {
        await RPC.doSave();
        resolve();
      }),
    );
    taskPromises.push(
      new Promise<void>(async resolve => {
        //const s = Date.now();
        await this.fetchTandZandOValueTransfers();
        //console.log('value transfers - ', Date.now() - s);
        resolve();
      }),
    );
    taskPromises.push(
      new Promise<void>(async resolve => {
        //const s = Date.now();
        await this.fetchTandZandOMessages();
        //console.log('messages - ', Date.now() - s);
        resolve();
      }),
    );

    Promise.allSettled(taskPromises);
  }

  async configure(): Promise<void> {
    // takes a while to start
    await this.fetchTandZandOValueTransfers();
    await this.fetchAddresses();
    await this.fetchTotalBalance();
    await this.fetchInfo();
    await this.fetchTandZandOMessages();

    //await this.fetchWalletSettings();

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
      //console.log('kill update timer', this.updateVTTimerID);
    }

    // and now the array of timers...
    while (this.timers.length > 0) {
      const inter = this.timers.pop();
      clearInterval(inter);
      //console.log('kill item array timers', inter);
    }
  }

  async sanitizeTimers(): Promise<void> {
    // and now the array of timers...
    let deleted: number[] = [];
    for (var i = 0; i < this.timers.length; i++) {
      if (this.updateTimerID && this.timers[i] === this.updateTimerID) {
        // do nothing
      } else {
        clearInterval(this.timers[i]);
        deleted.push(i);
        //console.log('sanitize - kill item array timers', this.timers[i]);
      }
    }
    // remove the cleared timers.
    for (var ii = 0; ii < deleted.length; i++) {
      this.timers.splice(deleted[ii], 1);
    }
  }

  static async doSave() {
    const syncstr: string = await native.save_wallet_file();
    console.log(`wallet saved: ${syncstr}`);
    return syncstr;
  }

  static deinitialize() {
    const str: string = native.deinitialize();
    console.log(`Deinitialize status: ${str}`);
  }

  static async getWalletVersion(): Promise<number | undefined> {
    try {
      const walletVersionStr: string = await native.get_wallet_version();
      if (walletVersionStr) {
        if (walletVersionStr.toLowerCase().startsWith('error')) {
          console.log(`Error wallet version ${walletVersionStr}`);
          return;
        }
      } else {
        console.log('Internal Error wallet version');
        return;
      }
      const walletVersionJSON = await JSON.parse(walletVersionStr);

      return walletVersionJSON.read_version;
    } catch (error) {
      console.log(`Critical Error wallet version ${error}`);
      return;
    }
  }
  
  // shield transparent balance to orchard
  async shieldTransparentBalanceToOrchard(): Promise<string> {
    // PROPOSING
    const shieldResult: string = await native.shield();
    console.log('shield proposal', shieldResult);
    if (shieldResult) {
      if (shieldResult.toLowerCase().startsWith("error")) {
        // error
        console.log(shieldResult);
        return shieldResult;
      }
    } else {
      // error empty
      const err = 'Error: Internal error shield';
      console.log(err);
      return err;
    }
    let shieldJSON = {} as {fee: number, error: string};
    try {
      shieldJSON = JSON.parse(shieldResult);
    } catch(error: any) {
      const err = `Error: parsing shield result ${error.message}`;
      console.log(err);
      return err;
    }
    if (shieldJSON.error) {
      const err = `Error: shield ${shieldJSON.error}`;
      console.log(err);
      return err;
    }
    console.log(shieldJSON);

    // SHIELDING
    const confirmResult: string = await native.confirm();
    if (confirmResult) {
      if (confirmResult.toLowerCase().startsWith("error")) {
        // error
        console.log(confirmResult);
        return confirmResult;
      }
    } else {
      // error empty
      const err = 'Error: Internal error confirm';
      console.log(err);
      return err;
    }
    let confirmJSON = {} as {txids: string[], error: string};
    try {
      confirmJSON = JSON.parse(confirmResult);
    } catch(error: any) {
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
      const txids: string = confirmJSON.txids.join(', ');
      console.log(txids);
      return txids;
    }
    console.log(confirmJSON);

    // weird case, I want to see the JSON in the error.
    return JSON.stringify(confirmJSON);
  }

  // Special method to get the Info object. This is used both internally and by the Loading screen
  static async getInfoObject(): Promise<InfoClass> {
    try {
      const infostr: string = await native.info_server();
      //console.log(infostr);
      if (!infostr || infostr.toLowerCase().startsWith("error")) {
        console.log("server info Failed", infostr);
        return new InfoClass(infostr);
      }
      const infoJSON: RPCInfoType = JSON.parse(infostr);

      const info = new InfoClass();
      info.chainName = infoJSON.chain_name;
      info.latestBlock = infoJSON.latest_block_height;
      info.connections = 1;
      info.version = `${infoJSON.vendor}/${infoJSON.git_commit ? infoJSON.git_commit.substring(0, 6) : ""}/${infoJSON.version}`;
      info.zcashdVersion = "Not Available";
      info.currencyName = info.chainName === ServerChainNameEnum.mainChainName ? "ZEC" : "TAZ";
      info.solps = 0;

      // Also set `zecPrice` manually
      const resultStr: string = await native.zec_price("false");
      //console.log(resultStr);
      if (resultStr) {
        if (resultStr.toLowerCase().startsWith("error")) {
          console.log(`Error fetching price Info ${resultStr}`);
          info.zecPrice = 0;
        } else {
          const resultJSON = JSON.parse(resultStr);
          info.zecPrice = resultJSON.current_price;
        }
      } else {
        console.log(`Error fetching price Info ${resultStr}`);
        info.zecPrice = 0;
      }

      // zingolib version
      let zingolibStr: string = await native.get_version();
      //console.log(zingolibStr);
      if (zingolibStr) {
        if (zingolibStr.toLowerCase().startsWith('error')) {
          zingolibStr = '<error>';
        }
      } else {
        zingolibStr = '<none>';
      }
      info.zingolib = zingolibStr;

      // we want to update the wallet last block
      const walletHeight: number = await RPC.fetchWalletHeight();
      //console.log(walletHeight);
      info.walletHeight = walletHeight;

      return info;
    } catch (err) {
      console.log("Error: to parse info ", err);
      return new InfoClass("Error: to parse info " + err);
    }
  }

  static async setWalletSettingOption(name: string, value: string): Promise<string> {
    //const r: string = await native.("setoption", `${name}=${value}`);
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
        if (walletSaveRequiredStr.toLowerCase().startsWith('error')) {
          console.log(`Error wallet save required ${walletSaveRequiredStr}`);
          return false;
        }
      } else {
        console.log('Internal Error wallet save required');
        return false;
      }
      const walletSaveRequiredJSON = await JSON.parse(walletSaveRequiredStr);

      return walletSaveRequiredJSON.save_required;
    } catch (error) {
      console.log(`Critical Error wallet save required ${error}`);
      return false;
    }
  }

  async fetchSyncPoll(): Promise<void> {
    const returnPoll: string = await native.poll_sync();
    if (!returnPoll || returnPoll.toLowerCase().startsWith('error')) {
      console.log('SYNC POLL ERROR', returnPoll);
      this.lastPollSyncError = returnPoll;
      return;
    }

    if (returnPoll.toLowerCase().startsWith('sync task has not been launched')) {
      console.log('SYNC POLL -> RUN SYNC', returnPoll);
      setTimeout(async () => {
        await this.refreshSync();
      }, 0);
      return;
    }

    if (returnPoll.toLowerCase().startsWith('sync task is not complete')) {
      console.log('SYNC POLL -> FETCH STATUS', returnPoll);
      setTimeout(async () => {
        await this.fetchSyncStatus();
      }, 0);
      return;
    }

    let sp;
    try {
      sp = await JSON.parse(returnPoll);
    } catch (error) {
      console.log('SYNC POLL ERROR - PARSE JSON', returnPoll, error);
      return;
    }

    console.log('SYNC POLL', sp);

    console.log('SYNC POLL -> FETCH STATUS');
    setTimeout(async () => {
      await this.fetchSyncStatus();
    }, 0);

  }

  async refreshSync(fullRescan?: boolean) {
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
      //console.log('rescan RUN', rescanStr);
      if (!rescanStr || rescanStr.toLowerCase().startsWith('error')) {
        console.log(`Error rescan ${rescanStr}`);
      }
      await this.configure();
    } else {
      const syncStr: string = await native.run_sync();
      //console.log('sync RUN', syncStr);
      if (!syncStr || syncStr.toLowerCase().startsWith('error')) {
        console.log(`Error sync ${syncStr}`);
      }
    }
  }

  async fetchSyncStatus(): Promise<void> {
    const returnStatus: string = await native.status_sync();
    if (!returnStatus || returnStatus.toLowerCase().startsWith('error')) {
      console.log('SYNC STATUS ERROR', returnStatus);
      return;
    }
    let ss = {} as SyncStatusType;
    try {
      ss = await JSON.parse(returnStatus);
      ss.lastError = this.lastPollSyncError;
    } catch (error) {
      console.log('SYNC STATUS ERROR - PARSE JSON', returnStatus, error);
      return;
    }

    //console.log('SYNC STATUS', ss);
    console.log('SYNC STATUS', ss.scan_ranges?.length, ss.percentage_total_outputs_scanned);

    //console.log('interval sync/rescan, secs', this.secondsBatch, 'timer', this.syncStatusTimerID);

    // store SyncStatus object for a new screen
    this.fnSetSyncStatus(ss);
    this.fnSetVerificationProgress(ss.percentage_total_outputs_scanned ? ss.percentage_total_outputs_scanned : 0);
  }

  async zingolibAddressesUnified(): Promise<any> {
    // fetch all Unified addresses
    const addressesStr: string = await native.get_unified_addresses();
    if (addressesStr) {
      if (addressesStr.toLowerCase().startsWith('error')) {
        console.log(`Error Unified addresses ${addressesStr}`);
        this.fnSetFetchError('Unified addresses', addressesStr);
        return;
      }
    } else {
      console.log('Internal Error Unified addresses');
      this.fnSetFetchError('Unified addresses', 'Error: Internal RPC Error');
      return;
    }
    const addressesJSON = JSON.parse(addressesStr);

    return addressesJSON;
  }

  async zingolibAddressesTransparent(): Promise<any> {
    // fetch all Transparent addresses
    const addressesStr: string = await native.get_transparent_addresses();
    if (addressesStr) {
      if (addressesStr.toLowerCase().startsWith('error')) {
        console.log(`Error Transparent addresses ${addressesStr}`);
        this.fnSetFetchError('Transparent addresses', addressesStr);
        return;
      }
    } else {
      console.log('Internal Error Transparent addresses');
      this.fnSetFetchError('Transparent addresses', 'Error: Internal RPC Error');
      return;
    }
    const addressesJSON = JSON.parse(addressesStr);

    return addressesJSON;
  }

  async zingolibValueTransfers() {
    // fetch value transfers
    const txValueTransfersStr: string = await native.get_value_transfers();
    if (txValueTransfersStr) {
      if (txValueTransfersStr.toLowerCase().startsWith('error')) {
        console.log(`Error txs ValueTransfers ${txValueTransfersStr}`);
        this.fnSetFetchError('ValueTransfers', txValueTransfersStr);
        return {};
      }
    } else {
      console.log('Internal Error txs ValueTransfers');
      this.fnSetFetchError('ValueTransfers', 'Error: Internal RPC Error');
      return {};
    }
    const txValueTransfersJSON = JSON.parse(txValueTransfersStr);

    return txValueTransfersJSON.value_transfers;
  }

  async zingolibMessages() {
    // fetch value transfers
    const txMessagesStr: string = await native.get_messages("");
    if (txMessagesStr) {
      if (txMessagesStr.toLowerCase().startsWith('error')) {
        console.log(`Error txs ValueTransfers ${txMessagesStr}`);
        this.fnSetFetchError('ValueTransfers', txMessagesStr);
        return {};
      }
    } else {
      console.log('Internal Error txs ValueTransfers');
      this.fnSetFetchError('ValueTransfers', 'Error: Internal RPC Error');
      return {};
    }
    const txMessagesJSON = JSON.parse(txMessagesStr);

    return txMessagesJSON.value_transfers;
  }

  // This method will get the total balances
  async fetchTotalBalance() {
    const spendableStr: string = await native.get_spendable_balance_total();
    console.log(spendableStr);
    let spendableJSON;
    if (spendableStr) {
      if (spendableStr.toLowerCase().startsWith('error')) {
        console.log(`Error spendable balance ${spendableStr}`);
      } else {
        spendableJSON = await JSON.parse(spendableStr);
      }
    } else {
      console.log('Internal Error spendable balance');
    }

    const balanceStr: string = await native.get_balance();
    if (balanceStr) {
      if (balanceStr.toLowerCase().startsWith('error')) {
        console.log(`Error balance ${balanceStr}`);
        this.fnSetFetchError('balance', balanceStr);
      }
    } else {
      console.log('Internal Error balance');
      this.fnSetFetchError('balance', 'Error: Internal RPC Error');
    }
    const balanceJSON = JSON.parse(balanceStr);

    //console.log(balanceJSON);

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
  }

  async fetchAddresses() {
    try {
      // UNIFIED
      const unifiedAddressesStr: string = await native.get_unified_addresses();
      if (unifiedAddressesStr) {
        if (unifiedAddressesStr.toLowerCase().startsWith('error')) {
          console.log(`Error addresses ${unifiedAddressesStr}`);
          return;
        }
      } else {
        console.log('Internal Error addresses');
        return;
      }
      const unifiedAddressesJSON: UnifiedAddressClass[] = await JSON.parse(unifiedAddressesStr) || [];
      //console.log(unifiedAddressesStr, unifiedAddressesJSON);

      // TRANSPARENT
      const transparentAddressStr: string = await native.get_transparent_addresses();
      if (transparentAddressStr) {
        if (transparentAddressStr.toLowerCase().startsWith('error')) {
          console.log(`Error addresses ${transparentAddressStr}`);
          return;
        }
      } else {
        console.log('Internal Error addresses');
        return;
      }
      const transparentAddressesJSON: TransparentAddressClass[] = await JSON.parse(transparentAddressStr) || [];
      //console.log(transparentAddressStr, transparentAddressesJSON);

      this.fnSetAddressesUnified(unifiedAddressesJSON);
      this.fnSetAddressesTransparent(transparentAddressesJSON);
    } catch (error) {
      console.log(`Critical Error addresses ${error}`);
      // relaunch the interval tasks just in case they are aborted.
      await this.clearTimers();
      await this.configure();
      return;
    }
  }

  static async createNewAddressUnified(type: string) {
    // Zingolib creates addresses like this:
    // o = orchard only
    // z = sapling only
    // oz = orchard + sapling
    const addrStr: string = await native.create_new_unified_address(type);
    return addrStr;
  }

  static async createNewAddressTransparent() {
    // Zingolib creates Addresses like this:
    // t = transparent
    const addrStr: string = await native.create_new_transparent_address();
    return addrStr;
  }

  static async fetchSeed(): Promise<string> {
    const seedStr: string = await native.get_seed();
    const seedJSON = JSON.parse(seedStr);

    return seedJSON.seed_phrase;
  }

  static async fetchUfvk(): Promise<string> {
    const ufvkStr: string = await native.get_ufvk();
    const ufvkJSON = JSON.parse(ufvkStr);

    return ufvkJSON.ufvk;
  }

  static async fetchBirthday(): Promise<number> {
    const walletKindStr: string = await native.wallet_kind();
    const walletKindJSON = JSON.parse(walletKindStr);

    if (
      walletKindJSON.kind === "Loaded from unified full viewing key" ||
      walletKindJSON.kind === "No keys found"
    ) {
      // ufvk
      const ufvkStr: string = await native.get_ufvk();
      const ufvkJSON = JSON.parse(ufvkStr);

      return ufvkJSON.birthday;
    } else {
      // seed
      const seedStr: string = await native.get_seed(); 
      const seedJSON = JSON.parse(seedStr);

      return seedJSON.birthday;
    }
  }

  static async fetchWalletHeight(): Promise<number> {
    const heightStr: string = await native.get_latest_block_wallet();
    const heightJSON = JSON.parse(heightStr);

    return heightJSON.height;
  }

  // Fetch all T and Z and O value transfers
  async fetchTandZandOValueTransfers() {
    // first to get the last server block.
    let latestBlockHeight: number = 0;
    console.log(this.server);
    const heightStr: string = await native.get_latest_block_server(this.server.uri);
    if (heightStr) {
      if (heightStr.toLowerCase().startsWith('error')) {
        console.log(`Error server height ${heightStr}`);
      } else {
        latestBlockHeight = Number(heightStr);
      }
    } else {
      console.log('Internal Error server height');
    }

    console.log('SERVER HEIGHT', latestBlockHeight);

    const valueTransfersJSON: any = await this.zingolibValueTransfers();

    //console.log('value transfers antes ', valueTransfersJSON);

    let vtList: ValueTransferClass[] = [];

    const walletHeight: number = await RPC.fetchWalletHeight();
    console.log('WALLET HEIGHT', walletHeight);

    valueTransfersJSON
      .forEach((tx: any) => {
        let currentVtList: ValueTransferClass = {} as ValueTransferClass;

        currentVtList.txid = tx.txid;
        currentVtList.time = tx.datetime;
        currentVtList.type = tx.kind;
        currentVtList.fee = (!tx.transaction_fee ? 0 : tx.transaction_fee) / 10 ** 8;
        currentVtList.zec_price = !tx.zec_price ? 0 : tx.zec_price;

        // unconfirmed means 0 confirmations, the tx is mining already.
        // 'pending' is obsolete
        if (
          tx.status === ValueTransferStatusEnum.calculated ||
          tx.status === ValueTransferStatusEnum.transmitted ||
          tx.status === ValueTransferStatusEnum.mempool
        ) {
          currentVtList.confirmations = 0;
        } else  if (tx.status === ValueTransferStatusEnum.confirmed) {
          currentVtList.confirmations = latestBlockHeight && latestBlockHeight >= walletHeight
            ? latestBlockHeight - tx.blockheight + 1
            : walletHeight - tx.blockheight + 1;
        } else {
          // impossible case... I guess.
          currentVtList.confirmations = 0;
        }

        currentVtList.blockheight = tx.blockheight;
        currentVtList.status = tx.status;
        currentVtList.address = !tx.recipient_address ? undefined : tx.recipient_address;
        currentVtList.amount = (!tx.value ? 0 : tx.value) / 10 ** 8;
        currentVtList.memos = !tx.memos || tx.memos.length === 0 ? undefined : tx.memos;
        currentVtList.pool = !tx.pool_received ? undefined : tx.pool_received;

        if (currentVtList.confirmations < 0) {
          console.log('[[[[[[[[[[[[[[[[[[', tx, 'server', latestBlockHeight, 'wallet', walletHeight);
        }
        //if (tx.txid.startsWith('426e')) {
        //  console.log('valuetranfer: ', tx);
        //  console.log('--------------------------------------------------');
        //}

        vtList.push(currentVtList);
      });

    //console.log(vtList);

    this.fnSetValueTransfersList(vtList);
  }

  // Fetch all T and Z and O value transfers
  async fetchTandZandOMessages() {
    // first to get the last server block.
    let latestBlockHeight: number = 0;
    const heightStr: string = await native.get_latest_block_server(this.server.uri);
    if (heightStr) {
      if (heightStr.toLowerCase().startsWith('error')) {
        console.log(`Error server height ${heightStr}`);
      } else {
        latestBlockHeight = Number(heightStr);
      }
    } else {
      console.log('Internal Error server height');
    }

    console.log('SERVER HEIGHT', latestBlockHeight);

    const MessagesJSON: any = await this.zingolibMessages();

    //console.log('value transfers antes ', valueTransfersJSON);

    let mList: ValueTransferClass[] = [];

    const walletHeight: number = await RPC.fetchWalletHeight();
    console.log('WALLET HEIGHT', walletHeight);

    MessagesJSON
      .forEach((tx: any) => {
        let currentMList: ValueTransferClass = {} as ValueTransferClass;

        currentMList.txid = tx.txid;
        currentMList.time = tx.datetime;
        currentMList.type = tx.kind;
        currentMList.fee = (!tx.transaction_fee ? 0 : tx.transaction_fee) / 10 ** 8;
        currentMList.zec_price = !tx.zec_price ? 0 : tx.zec_price;

        // unconfirmed means 0 confirmations, the tx is mining already.
        // 'pending' is obsolete
        if (
          tx.status === ValueTransferStatusEnum.calculated ||
          tx.status === ValueTransferStatusEnum.transmitted ||
          tx.status === ValueTransferStatusEnum.mempool
        ) {
          currentMList.confirmations = 0;
        } else  if (tx.status === ValueTransferStatusEnum.confirmed) {
          currentMList.confirmations = latestBlockHeight && latestBlockHeight >= walletHeight
            ? latestBlockHeight - tx.blockheight + 1
            : walletHeight - tx.blockheight + 1;
        } else {
          // impossible case... I guess.
          currentMList.confirmations = 0;
        }

        currentMList.blockheight = tx.blockheight;
        currentMList.status = tx.status;
        currentMList.address = !tx.recipient_address ? undefined : tx.recipient_address;
        currentMList.amount = (!tx.value ? 0 : tx.value) / 10 ** 8;
        currentMList.memos = !tx.memos || tx.memos.length === 0 ? undefined : tx.memos;
        currentMList.pool = !tx.pool_received ? undefined : tx.pool_received;

        if (currentMList.confirmations < 0) {
          console.log('[[[[[[[[[[[[[[[[[[', tx, 'server', latestBlockHeight, 'wallet', walletHeight);
        }
        //if (tx.txid.startsWith('426e')) {
        //  console.log('valuetranfer: ', tx);
        //  console.log('--------------------------------------------------');
        //}

        mList.push(currentMList);
      });

    //console.log(mList);

    this.fnSetMessagesList(mList);
  }
  
  // Send a transaction using the already constructed sendJson structure
  async sendTransaction(sendJson: Array<SendJsonToTypeType>): Promise<string> {
    const sendTxPromise = new Promise<string>(async (resolve, reject) => {
      // clear the timers - Tasks.
      await this.clearTimers();
      // sending
      let sendError: string = '';
      let sendTxids: string = '';
      try {
        console.log('send JSON', sendJson);
        // creating the propose
        const proposeStr: string = await native.send(JSON.stringify(sendJson));
        if (proposeStr) {
          if (proposeStr.toLowerCase().startsWith('error')) {
            console.log(`Error propose ${proposeStr}`);
            sendError = proposeStr;
          }
        } else {
          console.log('Internal Error propose');
          sendError = 'Error: Internal RPC Error: propose';
        }
        if (!sendError) {
          const proposeJSON: SendProposeType = await JSON.parse(proposeStr);
          if (proposeJSON.error) {
            console.log(`Error propose ${proposeJSON.error}`);
            sendError = proposeJSON.error;
          }
          if (!sendError) {
            // creating the transaction
            const sendStr: string = await native.confirm();
            if (sendStr) {
              if (sendStr.toLowerCase().startsWith('error')) {
                console.log(`Error confirm ${sendStr}`);
                sendError = sendStr;
              }
            } else {
              console.log('Internal Error confirm');
              sendError = 'Error: Internal RPC Error: confirm';
            }
            if (!sendError) {
              const sendJSON: SendType = await JSON.parse(sendStr);
              if (sendJSON.error) {
                console.log(`Error confirm ${sendJSON.error}`);
                sendError = sendJSON.error;
              } else if (sendJSON.txids && sendJSON.txids.length > 0) {
                sendTxids = sendJSON.txids.join(', ');
              }
            }
          }
        }
      } catch (error) {
        console.log(`Critical Error send ${error}`);
        sendError = `Error: send ${error}`;
      }

      // create the tasks
      await this.configure();

      if (sendTxids) {
        //console.log('00000000 RESOLVE send');
        resolve(sendTxids);
        return;
      }
      if (sendError) {
        //console.log('00000000 REJECT send');
        reject(sendError);
        return;
      }
    });

    return sendTxPromise;
  }

  async getZecPrice() {
    const resultStr: string = await native.zec_price("false");

    if (resultStr) {
      if (resultStr.toLowerCase().startsWith("error")) {
        console.log(`Error fetching price ${resultStr}`);
        this.fnSetZecPrice(0);
      } else {
        const resultJSON = JSON.parse(resultStr);
        this.fnSetZecPrice(resultJSON.current_price);
      }
    } else {
      console.log(`Error fetching price ${resultStr}`);
      this.fnSetZecPrice(0);
    }
  }
}
