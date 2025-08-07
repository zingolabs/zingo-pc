import {
  TotalBalanceClass,
  ValueTransferClass,
  InfoClass,
  SendProgressClass,
  WalletSettingsClass,
  AddressUnifiedClass,
  AddressTransparentClass,
  AddressKindEnum,
} from "../components/appstate";
import { ServerChainNameEnum } from "../components/appstate/enums/ServerChainNameEnum";
import { SendManyJsonType } from "../components/send";

import native from "../native.node";
import { RPCInfoType } from "./components/RPCInfoType";

export default class RPC {
  fnSetInfo: (info: InfoClass) => void;
  fnSetVerificationProgress: (verificationProgress: number) => void;
  fnSetTotalBalance: (tb: TotalBalanceClass) => void;
  fnSetAddressesUnified: (abs: AddressUnifiedClass[]) => void;
  fnSetAddressesTransparent: (abs: AddressTransparentClass[]) => void;
  fnSetValueTransfersList: (t: ValueTransferClass[]) => void;
  fnSetMessagesList: (t: ValueTransferClass[]) => void;
  fnSetZecPrice: (p?: number) => void;
  fnSetWalletSettings: (settings: WalletSettingsClass) => void;

  refreshTimerID?: NodeJS.Timeout;
  updateTimerID?: NodeJS.Timeout;
  syncTimerID?: NodeJS.Timeout;

  updateDataLock: boolean;

  lastBlockHeight: number;
  lastTxId?: string;

  fnSetFetchError: (command: string, error: string) => void;
  
  fetchAddressesLock: boolean;

  constructor(
    fnSetTotalBalance: (tb: TotalBalanceClass) => void,
    fnSetAddressesUnified: (abs: AddressUnifiedClass[]) => void,
    fnSetAddressesTransparent: (abs: AddressTransparentClass[]) => void,
    fnSetValueTransfersList: (t: ValueTransferClass[]) => void,
    fnSetMessagesList: (t: ValueTransferClass[]) => void,
    fnSetInfo: (info: InfoClass) => void,
    fnSetZecPrice: (p?: number) => void,
    fnSetWalletSettings: (settings: WalletSettingsClass) => void,
    fnSetVerificationProgress: (verificationProgress: number) => void,
    fnSetFetchError: (command: string, error: string) => void,
  ) {
    this.fnSetTotalBalance = fnSetTotalBalance;
    this.fnSetAddressesUnified = fnSetAddressesUnified;
    this.fnSetAddressesTransparent = fnSetAddressesTransparent;
    this.fnSetValueTransfersList = fnSetValueTransfersList;
    this.fnSetMessagesList = fnSetMessagesList;
    this.fnSetInfo = fnSetInfo;
    this.fnSetZecPrice = fnSetZecPrice;
    this.fnSetWalletSettings = fnSetWalletSettings;
    this.fnSetVerificationProgress = fnSetVerificationProgress;
    this.lastBlockHeight = 0;

    this.refreshTimerID = undefined;
    this.updateTimerID = undefined;
    this.syncTimerID = undefined;
    this.updateDataLock = false;

    this.fnSetFetchError = fnSetFetchError;

    this.fetchAddressesLock = false;
  }

  async configure() {
    if (!this.refreshTimerID) {
      this.refreshTimerID = setInterval(() => {
        console.log('refresh - 30 sec');
        // trying to sync
        this.refresh(false);
        // I need to fetch the ZEC price in USD.
        this.getZecPrice();
      }, 30 * 1000); // 30 sec
    }

    if (!this.updateTimerID) {
      this.updateTimerID = setInterval(() => {
        console.log('update data - 5 sec');
        this.updateData();
      }, 5 * 1000); // 3 secs
    }

    // Immediately call the refresh after configure to update the UI
    this.refresh(true);
    this.updateData();
  }

  clearTimers() {
    if (this.refreshTimerID) {
      clearInterval(this.refreshTimerID);
      this.refreshTimerID = undefined;
    }

    if (this.updateTimerID) {
      clearInterval(this.updateTimerID);
      this.updateTimerID = undefined;
    }

    if (this.syncTimerID) {
      clearInterval(this.syncTimerID);
      this.syncTimerID = undefined;
    }
  }

  static async doSync() {
    const syncstr: string = await native.run_sync();
    console.log(`Sync exec result: ${syncstr}`);
  }

  static async doRescan() {
    const syncstr: string = await native.run_rescan();
    console.log(`rescan exec result: ${syncstr}`);
  }

  static async doSyncStatus(): Promise<string> {
    const syncstr: string = await native.status_sync();
    console.log(`sync status: ${syncstr}`);
    return syncstr;
  }

  static deinitialize() {
    const str: string = native.deinitialize();
    console.log(`Deinitialize status: ${str}`);
  }
  
  // shield transparent balance to orchard
  async shieldTransparentBalanceToOrchard(): Promise<string> {
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
    console.log(confirmResult);

    this.updateData();
    return confirmResult;
  }

  async updateData() {
    if (this.updateDataLock) {
      //console.log("Update lock, returning");
      return;
    }

    this.updateDataLock = true;

    const latestBlockHeight: number = await this.fetchInfo();

    // And fetch the rest of the data.
    await this.fetchTotalBalance();
    await this.fetchAddresses();
    await this.fetchTandZandOValueTransfers(latestBlockHeight);
    await this.fetchTandZandOMessages(latestBlockHeight);
    await this.fetchWalletSettings();

    console.log(`Finished update data at ${latestBlockHeight}`);

    this.updateDataLock = false;
  }

  async refresh(fullRefresh: boolean) {
    if (this.syncTimerID) {
      console.log("Already have a sync process launched", this.syncTimerID);
      return;
    }
    const latestBlockHeight: number = await this.fetchInfo();
    const walletHeight: number = await RPC.fetchWalletHeight();

    if (
      fullRefresh ||
      !this.lastBlockHeight ||
      this.lastBlockHeight < latestBlockHeight ||
      walletHeight < latestBlockHeight
    ) {

      // If the latest block height has changed, make sure to sync. This will happen in a new thread
      RPC.doSync();

      // We need to wait for the sync to finish. The way we know the sync is done is
      // if the height matches the latestBlockHeight
      this.syncTimerID = setInterval(async () => {
        console.log('sync status - 2 sec'); 
        const walletHeight: number = await RPC.fetchWalletHeight();
        const walletBirthday: number = await RPC.fetchBirthday();

        let verificationProgress: number = 100;

        if (walletHeight >= latestBlockHeight) {
          // We are synced. Cancel the poll timer
          clearInterval(this.syncTimerID);
          this.syncTimerID = undefined;
          // the sync is finished
          verificationProgress = 100;
          // And fetch the rest of the data.
          this.fetchTotalBalance();
          this.fetchTandZandOValueTransfers(latestBlockHeight);
          this.fetchTandZandOMessages(latestBlockHeight);
      
          this.lastBlockHeight = latestBlockHeight;

          // All done
          console.log(`Finished (blocks) full refresh at server: ${latestBlockHeight} & wallet: ${walletHeight}`);
        } else {
          // if the progress is still running we need to update the UI
          // we want to update the progress of the current syncing
          const ssStr: string = await RPC.doSyncStatus();
          const ss = JSON.parse(ssStr);
          if (!ss.in_progress) {
            // We are synced. Cancel the poll timer
            clearInterval(this.syncTimerID);
            this.syncTimerID = undefined;
            // the sync is finished
            // the sync process in zingolib finish fakely & if you try again
            // the sync continue with a NEW ID
            // And fetch the rest of the data.
            this.fetchTotalBalance();
            this.fetchTandZandOValueTransfers(latestBlockHeight);
            this.fetchTandZandOMessages(latestBlockHeight);
      
            this.lastBlockHeight = latestBlockHeight;

            // All done
            console.log(`Finished (in_progress) full refresh at ${latestBlockHeight} & wallet: ${walletHeight}`);
          } else {
            // the sync is running
            const progress_blocks: number = (ss.synced_blocks + ss.trial_decryptions_blocks + ss.witnesses_updated) / 3;

            // this calculation is for the total of blocks, nothing to do with batches
            // because batches are calculated only for the current sync process
            // which in most of the times is partial, not total. 
            // edge case: in a rescan sometimes the process can start from sapling age, but the
            // wallet birthday doesn't change...
            const firstBlockProcess: number = ss.end_block - (ss.batch_num * 100);
            let firstBlockProcessFixed: number;
            if (firstBlockProcess < walletBirthday) {
              firstBlockProcessFixed = firstBlockProcess;
            } else {
              firstBlockProcessFixed = walletBirthday;
            }
            const sync_blocks: number = ss.end_block + progress_blocks - firstBlockProcessFixed;
            const total_blocks: number = latestBlockHeight - firstBlockProcessFixed;

            verificationProgress = (sync_blocks * 100) / total_blocks;
          }
        }

        this.fnSetVerificationProgress(verificationProgress);
      }, 2 * 1000); // two seconds is ok for the UI.
    } else {
      // Already at the latest block
      console.log("Already have latest block, waiting for next refresh");
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
      info.version = `${infoJSON.vendor}/${infoJSON.git_commit ? infoJSON.git_commit.substring(0, 6) : ""}/${infoJSON.version}`;
      info.zcashdVersion = "Not Available";
      info.currencyName = info.chainName === ServerChainNameEnum.mainChainName ? "ZEC" : "TAZ";
      info.solps = 0;

      // Also set `zecPrice` manually
      const resultStr: string = await native.zec_price("false");
      if (resultStr) {
        if (resultStr.toLowerCase().startsWith("error") || isNaN(parseFloat(resultStr))) {
          console.log(`Error fetching price Info ${resultStr}`);
          info.zecPrice = 0;
        } else {
          info.zecPrice = parseFloat(resultStr);
        }
      } else {
        console.log(`Error fetching price Info ${resultStr}`);
        info.zecPrice = 0;
      }

      // zingolib version
      let zingolibStr: string = await native.get_version();
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
      info.walletHeight = walletHeight;

      return info;
    } catch (err) {
      console.log("Error: to parse info", err);
      return new InfoClass("Error: to parse info" + err);
    }
  }

  async fetchWalletSettings() {
    const cmd = 'getoption';
    try {
      const download_memos_str: string = await native.get_option_wallet();
      if (download_memos_str) {
        if (download_memos_str.toLowerCase().startsWith('error')) {
          console.log(`Error download memos ${download_memos_str}`);
          this.fnSetFetchError(cmd, download_memos_str);
          return;
        }
      } else {
        console.log('Internal Error download memos');
        this.fnSetFetchError(cmd, 'Error: Internal RPC Error download memos');
        return;
      }
      const download_memos = JSON.parse(download_memos_str).download_memos;

      let transaction_filter_threshold = 0;
      const spam_filter_str: string = await native.get_option_wallet();
      if (spam_filter_str) {
        if (spam_filter_str.toLowerCase().startsWith('error')) {
          console.log(`Error transaction filter threshold ${spam_filter_str}`);
          this.fnSetFetchError(cmd, spam_filter_str);
          return;
        }
      } else {
        console.log('Internal Error transaction filter threshold');
        this.fnSetFetchError(cmd, 'Error: Internal RPC Error transaction filter threshold');
        return;
      }
      transaction_filter_threshold = JSON.parse(spam_filter_str).transaction_filter_threshold;

      // If it is -1, i.e., it was not set, then set it to 500
      if (transaction_filter_threshold < 0) {
        await RPC.setWalletSettingOption("transaction_filter_threshold", "500");
      }

      const wallet_settings = new WalletSettingsClass();
      wallet_settings.download_memos = download_memos;
      wallet_settings.transaction_filter_threshold = transaction_filter_threshold;

      this.fnSetWalletSettings(wallet_settings);
    } catch (e) {
      console.log(`Error getting spam filter threshold: ${e}`);
      this.fnSetFetchError(cmd, `${e}`);
      return;
    }
  }

  static async setWalletSettingOption(name: string, value: string): Promise<string> {
    //const r: string = await native.("setoption", `${name}=${value}`);
    const r: string = await native.set_option_wallet();

    return r;
  }

  async fetchInfo(): Promise<number> {
    const info: InfoClass = await RPC.getInfoObject();

    this.fnSetInfo(info);

    return info.latestBlock;
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
      if (this.fetchAddressesLock) {
        return;
      }
      this.fetchAddressesLock = true;

      // UNIFIED
      const unifiedAddressesStr: string = await native.get_unified_addresses();
      if (unifiedAddressesStr) {
        if (unifiedAddressesStr.toLowerCase().startsWith('error')) {
          console.log(`Error addresses ${unifiedAddressesStr}`);
          this.fetchAddressesLock = false;
          return;
        }
      } else {
        console.log('Internal Error addresses');
        this.fetchAddressesLock = false;
        return;
      }
      const unifiedAddressesJSON: AddressUnifiedClass[] = await JSON.parse(unifiedAddressesStr) || [];

      // TRANSPARENT
      const transparentAddressStr: string = await native.get_transparent_addresses();
      if (transparentAddressStr) {
        if (transparentAddressStr.toLowerCase().startsWith('error')) {
          console.log(`Error addresses ${transparentAddressStr}`);
          this.fetchAddressesLock = false;
          return;
        }
      } else {
        console.log('Internal Error addresses');
        this.fetchAddressesLock = false;
        return;
      }
      const transparentAddressesJSON: AddressTransparentClass[] = await JSON.parse(transparentAddressStr) || [];

      this.fnSetAddressesUnified(unifiedAddressesJSON);
      this.fnSetAddressesTransparent(transparentAddressesJSON);
      this.fetchAddressesLock = false;
    } catch (error) {
      console.log(`Critical Error addresses ${error}`);
      // relaunch the interval tasks just in case they are aborted.
      await this.clearTimers();
      await this.configure();
      this.fetchAddressesLock = false;
      return;
    }
  }

  static async createNewAddressUnified(type: AddressKindEnum) {
    // Zingolib creates addresses like this:
    // o = orchard only
    // oz = orchard + sapling
    // z = sapling only
    const addrStr: string = await native.create_new_unified_address(
      type === AddressKindEnum.unified ? "oz" : type === AddressKindEnum.sapling ? "z" : "o"
    );
    const addrJSON = JSON.parse(addrStr);

    return addrJSON[0];
  }

  static async createNewAddressTransparent(type: AddressKindEnum) {
    const addrStr: string = await native.create_new_transparent_address();
    const addrJSON = JSON.parse(addrStr);

    return addrJSON[0];
  }

  static async fetchSeed(): Promise<string> {
    const seedStr: string = await native.get_seed();
    const seedJSON = JSON.parse(seedStr);

    return seedJSON.seed;
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
  async fetchTandZandOValueTransfers(latestBlockHeight: number) {
    const valueTransfersJSON: any = await this.zingolibValueTransfers();

    //console.log('value transfers antes ', valueTransfersJSON);

    let vtList: ValueTransferClass[] = [];

    const walletHeight: number = await RPC.fetchWalletHeight();

    valueTransfersJSON
      .forEach((tx: any) => {
        let currentVtList: ValueTransferClass = {} as ValueTransferClass;

        currentVtList.txid = tx.txid;
        currentVtList.time = tx.datetime;
        // basic in zingolib is the same as send-to-self in zingo.
        currentVtList.type = tx.kind === 'basic' ? 'send-to-self' : tx.kind;
        currentVtList.fee = (!tx.transaction_fee ? 0 : tx.transaction_fee) / 10 ** 8;
        currentVtList.zec_price = !tx.zec_price ? 0 : tx.zec_price;

        // unconfirmed means 0 confirmations, the tx is mining already.
        // 'pending' is obsolete
        if (
          tx.status === 'calculated' ||
          tx.status === 'transmitted' ||
          tx.status === 'mempool'
        ) {
          currentVtList.confirmations = 0;
        } else  if (tx.status === 'confirmed') {
          currentVtList.confirmations = latestBlockHeight && latestBlockHeight >= walletHeight
            ? latestBlockHeight - tx.blockheight + 1
            : walletHeight - tx.blockheight + 1;
        } else {
          // impossible case... I guess.
          currentVtList.confirmations = 0;
        }

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
  async fetchTandZandOMessages(latestBlockHeight: number) {
    const MessagesJSON: any = await this.zingolibMessages();

    //console.log('value transfers antes ', valueTransfersJSON);

    let mList: ValueTransferClass[] = [];

    const walletHeight: number = await RPC.fetchWalletHeight();

    MessagesJSON
      .forEach((tx: any) => {
        let currentMList: ValueTransferClass = {} as ValueTransferClass;

        currentMList.txid = tx.txid;
        currentMList.time = tx.datetime;
        // basic in zingolib is the same as send-to-self in zingo.
        currentMList.type = tx.kind === 'basic' ? 'send-to-self' : tx.kind;
        currentMList.fee = (!tx.transaction_fee ? 0 : tx.transaction_fee) / 10 ** 8;
        currentMList.zec_price = !tx.zec_price ? 0 : tx.zec_price;

        // unconfirmed means 0 confirmations, the tx is mining already.
        // 'pending' is obsolete
        if (
          tx.status === 'calculated' ||
          tx.status === 'transmitted' ||
          tx.status === 'mempool'
        ) {
          currentMList.confirmations = 0;
        } else  if (tx.status === 'confirmed') {
          currentMList.confirmations = latestBlockHeight && latestBlockHeight >= walletHeight
            ? latestBlockHeight - tx.blockheight + 1
            : walletHeight - tx.blockheight + 1;
        } else {
          // impossible case... I guess.
          currentMList.confirmations = 0;
        }

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
  async sendTransaction(sendJson: SendManyJsonType[], setSendProgress: (p?: SendProgressClass) => void): Promise<string | string[]> {
    // First, get the previous send progress id, so we know which ID to track
    const prevProgressStr: string = "";
    const prevProgressJSON = JSON.parse(prevProgressStr);
    const prevSendId: number = prevProgressJSON.id;
    let sendTxids: string[] = [];

    // proposing...
    try {
      console.log(`Sending ${JSON.stringify(sendJson)}`);
      const resp: string = await native.send(JSON.stringify(sendJson));
      console.log(`End Sending, response: ${resp}`); 
    } catch (err) {
      console.log(`Error sending Tx: ${err}`);
      throw err;
    }

    // sending...
    try {
      console.log('Confirming');
      const resp: string = await native.confirm();
      console.log(`End Confirming, response: ${resp}`);
      if (!resp || resp.toLowerCase().startsWith('error')) {
        console.log(`Error confirming Tx: ${resp}`);
        throw Error(resp);  
      } else {
        const respJSON = JSON.parse(resp);
        if (respJSON.error) {
          console.log(`Error confirming Tx: ${respJSON.error}`);
          throw Error(respJSON.error);
        } else if (respJSON.txids && respJSON.txids.length > 0) {
          sendTxids = respJSON.txids as string[];
        } else {
          console.log(`Error confirming: no error, no txids `);
          throw Error('Error confirming: no error, no txids');
        }
      }
    } catch (err) {
      console.log(`Error confirming Tx: ${err}`);
      throw err;
    }

    const startTimeSeconds: number = new Date().getTime() / 1000;

    // The send command is async, so we need to poll to get the status
    const sendTxPromise: Promise<string | string[]> = new Promise((resolve, reject) => {
      const intervalID = setInterval(async () => {
        const progressStr: string = "";
        const progressJSON = JSON.parse(progressStr);
        
        const updatedProgress = new SendProgressClass();
        if (progressJSON.id === prevSendId && !sendTxids) {
          // Still not started, so wait for more time
          setSendProgress(updatedProgress);
          return;
        }

        console.log(progressJSON);

        // Calculate ETA.
        let secondsPerComputation: number = 3; // default
        if (progressJSON.progress > 0) {
          const currentTimeSeconds: number = new Date().getTime() / 1000;
          secondsPerComputation = (currentTimeSeconds - startTimeSeconds) / progressJSON.progress;
        }
        //console.log(`Seconds Per compute = ${secondsPerComputation}`);

        let eta: number = Math.round((progressJSON.total - progressJSON.progress) * secondsPerComputation);
        if (eta <= 0) {
          eta = 1;
        }

        updatedProgress.progress = progressJSON.progress;
        updatedProgress.total = Math.max(progressJSON.total, progressJSON.progress); // sometimes, due to change, the total can be off by 1
        updatedProgress.sendInProgress = true;
        updatedProgress.etaSeconds = eta;

        if (progressJSON.id === prevSendId && !sendTxids) {
          // Still not started, so wait for more time
          setSendProgress(updatedProgress);
          return;
        }

        if ((!progressJSON.txids || progressJSON.txids.length === 0) && !progressJSON.error && !sendTxids) {
          // Still processing
          setSendProgress(updatedProgress);
          return;
        }

        // Finished processing
        clearInterval(intervalID);
        setSendProgress(undefined);

        if (progressJSON.txids && progressJSON.txids.length > 0) {
          // And refresh data (full refresh)
          this.refresh(true);

          resolve(progressJSON.txids as string[]);
        }

        if (progressJSON.error) {
          reject(progressJSON.error as string);
        }

        if (sendTxids) {
          // And refresh data (full refresh)
          this.refresh(true);

          resolve(sendTxids as string[]);
        }
      }, 2 * 1000); // Every 2 seconds
    });

    return sendTxPromise;
  }

  async getZecPrice() {
    const resultStr: string = await native.zec_price("false");

    if (resultStr) {
      if (resultStr.toLowerCase().startsWith("error") || isNaN(parseFloat(resultStr))) {
        console.log(`Error fetching price ${resultStr}`);
        this.fnSetZecPrice(0);
      } else {
        this.fnSetZecPrice(parseFloat(resultStr));
      }
    } else {
      console.log(`Error fetching price ${resultStr}`);
      this.fnSetZecPrice(0);
    }
  }
}
