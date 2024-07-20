import {
  TotalBalance,
  Transaction,
  RPCConfig,
  Info,
  SendProgress,
  AddressType,
  Address,
  WalletSettings,
  ReceiverType,
} from "../components/appstate";
import { SendManyJsonType } from "../components/send";

import native from "../native.node";

export default class RPC {
  rpcConfig?: RPCConfig;

  fnSetInfo: (info: Info) => void;
  fnSetVerificationProgress: (verificationProgress: number) => void;
  fnSetTotalBalance: (tb: TotalBalance) => void;
  fnSetAddresses: (abs: Address[]) => void;
  fnSetTransactionsList: (t: Transaction[]) => void;
  fnSetZecPrice: (p?: number) => void;
  fnSetWalletSettings: (settings: WalletSettings) => void;
  refreshTimerID?: NodeJS.Timeout;
  updateTimerID?: NodeJS.Timeout;
  syncTimerID?: NodeJS.Timeout;

  updateDataLock: boolean;

  lastBlockHeight: number;
  lastTxId?: string;

  fnSetFetchError: (command: string, error: string) => void;

  constructor(
    fnSetTotalBalance: (tb: TotalBalance) => void,
    fnSetAddresses: (abs: Address[]) => void,
    fnSetTransactionsList: (t: Transaction[]) => void,
    fnSetInfo: (info: Info) => void,
    fnSetZecPrice: (p?: number) => void,
    fnSetWalletSettings: (settings: WalletSettings) => void,
    fnSetVerificationProgress: (verificationProgress: number) => void,
    fnSetFetchError: (command: string, error: string) => void,
  ) {
    this.fnSetTotalBalance = fnSetTotalBalance;
    this.fnSetAddresses = fnSetAddresses;
    this.fnSetTransactionsList = fnSetTransactionsList;
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
  }

  async configure(rpcConfig: RPCConfig) {
    this.rpcConfig = rpcConfig;

    if (!this.refreshTimerID) {
      this.refreshTimerID = setInterval(() => {
        console.log('refresh - 30 sec');
        // trying to sync
        this.refresh(false);
        // I need to save the wallet every 30 seconds  Just in case.
        //RPC.doSave();
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
    //RPC.doSave();
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

  static doSync() {
    const syncstr: string = native.zingolib_execute_spawn("sync", "");
    console.log(`Sync exec result: ${syncstr}`);
  }

  static doRescan() {
    const syncstr: string = native.zingolib_execute_spawn("rescan", "");
    console.log(`rescan exec result: ${syncstr}`);
  }

  static async doSyncStatus(): Promise<string> {
    const syncstr: string = await native.zingolib_execute_async("syncstatus", "");
    console.log(`sync status: ${syncstr}`);
    return syncstr;
  }

  // deprecated in zingolib 
  //static async doSave() {
  //  const savestr: string = await native.zingolib_execute_async("save", "");
  //  console.log(`Save status: ${savestr}`);
  //}

  static deinitialize() {
    const str: string = native.zingolib_deinitialize();
    console.log(`Deinitialize status: ${str}`);
  }

  // shield all balance to orchard
  async shieldAllBalanceToOrchard(): Promise<string> {
    try {
      const result: string = await native.zingolib_execute_async("shield", 'all');
      this.updateData();
      return result;
    } catch(error: any) {
      console.log(`Error while trying to shield all balance ${error.message}`);
      return `Error: ${error.message}`;
    }
  }
  
  // shield transparent balance to orchard
  async shieldTransparentBalanceToOrchard(): Promise<string> {
    try {
      const result: string = await native.zingolib_execute_async("shield", 'transparent');
      this.updateData();
      return result;
    } catch(error: any) {
      console.log(`Error while trying to shield transparent balance ${error.message}`);
      return `Error: ${error.message}`;
    }
  }

  // shield sapling balance to orchard
  async shieldSaplingBalanceToOrchard(): Promise<string> {
    try {
      const result: string = await native.zingolib_execute_async("shield", 'sapling');
      this.updateData();
      return result;
    } catch(error: any) {
      console.log(`Error while trying to shield sapling balance ${error.message}`);
      return `Error: ${error.message}`;
    }
  }

  async updateData() {
    //console.log("Update data triggered");
    if (this.updateDataLock) {
      //console.log("Update lock, returning");
      return;
    }

    this.updateDataLock = true;
    //const latest_txid: string = await RPC.getLastTxid();

    const latestBlockHeight: number = await this.fetchInfo();
    //this.getZecPrice();

    //if (this.lastTxId !== latest_txid) {
    //  console.log(`Latest: ${latest_txid}, prev = ${this.lastTxId}`);

    //  this.lastTxId = latest_txid;

      //console.log("Update data fetching new txns");

      // And fetch the rest of the data.
      await this.fetchTotalBalance();
      //await this.fetchTandZandOTransactionsSummaries(latestBlockHeight);
      this.fetchTandZandOValueTransfers(latestBlockHeight);
      await this.fetchWalletSettings();

      console.log(`Finished update data at ${latestBlockHeight}`);
    //}
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
          //this.fetchTandZandOTransactionsSummaries(latestBlockHeight);
          this.fetchTandZandOValueTransfers(latestBlockHeight);
      
          //this.getZecPrice();

          this.lastBlockHeight = latestBlockHeight;

          // Save the wallet
          //RPC.doSave();

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
            // verificationProgress = 100;
            // And fetch the rest of the data.
            this.fetchTotalBalance();
            //this.fetchTandZandOTransactionsSummaries(latestBlockHeight);
            this.fetchTandZandOValueTransfers(latestBlockHeight);
      
            //this.getZecPrice();

            this.lastBlockHeight = latestBlockHeight;

            // Save the wallet
            //RPC.doSave();

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
  static async getInfoObject(): Promise<Info> {
    const infostr: string = await native.zingolib_execute_async("info", "");
    //console.log(`INFO INFO INFO: ${infostr}`);
    try {
      if (infostr.toLowerCase().startsWith("error")) {
        console.log("server info Failed", infostr);
        return new Info(infostr);
      }
      const infoJSON = JSON.parse(infostr);

      const info = new Info();
      info.testnet = infoJSON.chain_name === "test";
      info.latestBlock = infoJSON.latest_block_height;
      info.connections = 1;
      info.version = `${infoJSON.vendor}/${infoJSON.git_commit.substring(0, 6)}/${infoJSON.version}`;
      //info.zcashdVersion = infoJSON.zcashd_version;
      info.zcashdVersion = "Not Available";
      info.currencyName = info.testnet ? "TAZ" : "ZEC";
      info.solps = 0;

      // Also set `zecPrice` manually
      const resultStr: string = await native.zingolib_execute_async("updatecurrentprice", "");
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

      //default fee
      const feeStr: string = await native.zingolib_execute_async("defaultfee", "");
      if (feeStr.toLowerCase().startsWith("error")) {
        console.log("server defaultfee Failed", feeStr);
        return new Info(feeStr);
      }
      const feeJSON = JSON.parse(feeStr);
      info.defaultFee = feeJSON.defaultfee / 10 ** 8;

      //zingolib version
      let zingolibStr: string = await native.zingolib_execute_async("version", "");
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
      return new Info("Error: to parse info" + err);
    }
  }

  static doImportPrivKey(key: string, birthday: string): string {
    const args = { key, birthday: parseInt(birthday, 10) };

    if (isNaN(parseInt(birthday, 10))) {
      return `Error: Couldn't parse ${birthday} as a number`;
    }

    const address: string = native.zingolib_execute_spawn("import", JSON.stringify(args));

    return address;
  }

  async fetchWalletSettings() {
    const cmd = 'getoption';
    try {
      const download_memos_str: string = await native.zingolib_execute_async(cmd, "download_memos");
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
      const spam_filter_str: string = await native.zingolib_execute_async(cmd, "transaction_filter_threshold");
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

      const wallet_settings = new WalletSettings();
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
    const r: string = await native.zingolib_execute_async("setoption", `${name}=${value}`);

    //RPC.doSave();
    return r;
  }

  async fetchInfo(): Promise<number> {
    const info: Info = await RPC.getInfoObject();

    this.fnSetInfo(info);

    return info.latestBlock;
  }

  async zingolibBalance(): Promise<any> {
    const balanceStr: string = await native.zingolib_execute_async("balance", "");
    if (balanceStr) {
      if (balanceStr.toLowerCase().startsWith('error')) {
        console.log(`Error balance ${balanceStr}`);
        this.fnSetFetchError('balance', balanceStr);
        return;
      }
    } else {
      console.log('Internal Error balance');
      this.fnSetFetchError('balance', 'Error: Internal RPC Error');
      return;
    }
    const balanceJSON = JSON.parse(balanceStr);

    //console.log(balanceJSON);

    let formattedJSON = {
      obalance: balanceJSON.orchard_balance,
      verified_obalance: balanceJSON.verified_orchard_balance,
      spendable_obalance: balanceJSON.spendable_orchard_balance,
      unverified_obalance: balanceJSON.unverified_orchard_balance,
      zbalance: balanceJSON.sapling_balance,
      verified_zbalance: balanceJSON.verified_sapling_balance,
      spendable_zbalance: balanceJSON.spendable_sapling_balance,
      unverified_zbalance: balanceJSON.unverified_sapling_balance,
      tbalance: balanceJSON.transparent_balance,
      ua_addresses: [],
      z_addresses: [],
      t_addresses: [],
    };

    // fetch all addresses
    const addressesStr: string = await native.zingolib_execute_async("addresses", "");
    if (addressesStr) {
      if (addressesStr.toLowerCase().startsWith('error')) {
        console.log(`Error addresses ${addressesStr}`);
        this.fnSetFetchError('addresses', addressesStr);
        return;
      }
    } else {
      console.log('Internal Error addresses');
      this.fnSetFetchError('addresses', 'Error: Internal RPC Error');
      return;
    }
    const addressesJSON = JSON.parse(addressesStr);

    // fetch all notes
    const notesStr: string = await native.zingolib_execute_async("notes", "");
    if (notesStr) {
      if (notesStr.toLowerCase().startsWith('error')) {
        console.log(`Error notes ${notesStr}`);
        this.fnSetFetchError('notes', notesStr);
        return;
      }
    } else {
      console.log('Internal Error notes');
      this.fnSetFetchError('notes', 'Error: Internal RPC Error');
      return;
    }
    const notesJSON = JSON.parse(notesStr);

    //console.log(notesJSON);

    // construct ua_addresses with their respective balance
    const ua_addr = addressesJSON.map((a: any) => {
      // To get the balance, sum all notes related to this address
      const ua_bal = notesJSON.unspent_orchard_notes
        .filter((o: any) => o.address === a.address)
        .reduce((acc: any, ua_unsp_note: any) => acc + ua_unsp_note.value, 0);

      // Also add pending notes
      const ua_pend_bal = notesJSON.pending_orchard_notes
        .filter((o: any) => o.address === a.address)
        .reduce((acc: any, ua_pend_note: any) => acc + ua_pend_note.value, 0);

      return {
        address: a.address,
        balance: ua_bal + ua_pend_bal,
        receivers: a.receivers,
        address_type: AddressType.unified,
      };
    });

    // construct z_addresses with their respective balance
    const z_addr = addressesJSON
      .filter((a: any) => a.receivers.sapling)
      .map((a: any) => {
        // To get the balance, sum all notes related to this address
        const z_bal = notesJSON.unspent_sapling_notes
          .filter((o: any) => o.address === a.address)
          .reduce((acc: any, z_unsp_note: any) => acc + z_unsp_note.value, 0);

        // Also add pending notes
        const z_pend_bal = notesJSON.pending_sapling_notes
          .filter((o: any) => o.address === a.address)
          .reduce((acc: any, z_pend_note: any) => acc + z_pend_note, 0);

        // To get spendable balance, filter the unspent_sapling_notes where spendable = true
        const z_spendable_bal = notesJSON.unspent_sapling_notes
          .filter((o: any) => o.address === a.address && o.spendable)
          .reduce((acc: any, z_spendable_note: any) => acc + z_spendable_note.value, 0);

        return {
          address: a.receivers.sapling,
          zbalance: z_bal + z_pend_bal,
          verified_zbalance: z_bal,
          spendable_zbalance: z_spendable_bal,
          unverified_zbalance: z_pend_bal,
          address_type: AddressType.sapling,
        };
      });

    // construct t_addresses with their respective balance
    const t_addr = addressesJSON
      .filter((a: any) => a.receivers.transparent)
      .map((a: any) => {
        // To get the balance, sum all UTXOs related to this address
        const t_bal = notesJSON.utxos
          .filter((o: any) => o.address === a.address)
          .reduce((acc: any, t_utxo: any) => acc + t_utxo.value, 0);

        // Also add pending UTXOs
        const t_pend_bal = notesJSON.pending_utxos
          .filter((o: any) => o.address === a.address)
          .reduce((acc: any, t_pend_utxo: any) => acc + t_pend_utxo, 0);

        return {
          address: a.receivers.transparent,
          balance: t_bal + t_pend_bal,
          address_type: AddressType.transparent,
        };
      });

    // set corresponding addresses in the formatted Json
    formattedJSON.ua_addresses = ua_addr;
    formattedJSON.z_addresses = z_addr;
    formattedJSON.t_addresses = t_addr;

    return formattedJSON;
  }

  async zingolibNotes(): Promise<any> {
    // fetch all notes
    const notesStr: string = await native.zingolib_execute_async("notes", "");
    if (notesStr) {
      if (notesStr.toLowerCase().startsWith('error')) {
        console.log(`Error notes ${notesStr}`);
        this.fnSetFetchError('notes', notesStr);
        return;
      }
    } else {
      console.log('Internal Error notes');
      this.fnSetFetchError('notes', 'Error: Internal RPC Error');
      return;
    }
    const notesJSON = JSON.parse(notesStr);

    // fetch all addresses
    const addressesStr: string = await native.zingolib_execute_async("addresses", "");
    if (addressesStr) {
      if (addressesStr.toLowerCase().startsWith('error')) {
        console.log(`Error addresses ${addressesStr}`);
        this.fnSetFetchError('addresses', addressesStr);
        return;
      }
    } else {
      console.log('Internal Error addresses');
      this.fnSetFetchError('addresses', 'Error: Internal RPC Error');
      return;
    }
    const addressesJSON = JSON.parse(addressesStr);

    let formattedJSON = {
      unspent_notes: [],
      pending_notes: [],
      utxos: [],
      pending_utxos: [],
    };

    // Construct unspent_notes concatenating unspent_orchard_notes and unspent_sapling_notes
    const ua_unsp_notes = notesJSON.unspent_orchard_notes;
    const z_unsp_notes = notesJSON.unspent_sapling_notes.map((z_unsp_note: any) => {
      // need to get the sapling address, instead of ua address
      const z_addr = addressesJSON.find((a: any) => a.address === z_unsp_note.address);
      if (z_addr) {
        z_unsp_note.address = z_addr.receivers.sapling;
      }

      return z_unsp_note;
    });

    const unsp_notes = ua_unsp_notes.concat(z_unsp_notes);

    // Construct pending_notes concatenating pending_orchard_notes and pending_sapling_notes
    const ua_pend_notes = notesJSON.pending_orchard_notes;
    const z_pend_notes = notesJSON.pending_sapling_notes.map((z_pend_note: any) => {
      // need to get the sapling address, instead of ua address
      const z_addr = addressesJSON.find((a: any) => a.address === z_pend_note.address);
      if (z_addr) {
        z_pend_note.address = z_addr.receivers.sapling;
      }

      return z_pend_note;
    });

    const pend_notes = ua_pend_notes.concat(z_pend_notes);

    // construct utxos, replacing the addresses accordingly
    const utxos = notesJSON.utxos.map((utxo: any) => {
      // need to get the transparent address, instead of ua address
      const t_addr = addressesJSON.find((a: any) => a.address === utxo.address);
      if (t_addr) {
        utxo.address = t_addr.receivers.transparent;
      }

      return utxo;
    });

    // construct pending_utxos, replacing the addresses accordingly
    const pending_utxos = notesJSON.pending_utxos.map((pend_utxo: any) => {
      // need to get the transparent address, instead of ua address
      const t_addr = addressesJSON.find((a: any) => a.address === pend_utxo.address);
      if (t_addr) {
        pend_utxo.address = t_addr.receivers.transparent;
      }

      return pend_utxo;
    });

    // Set corresponding fields
    formattedJSON.unspent_notes = unsp_notes;
    formattedJSON.pending_notes = pend_notes;
    formattedJSON.utxos = utxos;
    formattedJSON.pending_utxos = pending_utxos;

    return formattedJSON;
  }

  /*
  async zingolibTxSummaries() {
    // fetch transaction summaries
    const txSummariesStr: string = native.zingolib_get_transaction_summaries();
    if (txSummariesStr) {
      if (txSummariesStr.toLowerCase().startsWith('error')) {
        console.log(`Error txs summaries ${txSummariesStr}`);
        this.fnSetFetchError('transaction summaries', txSummariesStr);
        return {};
      }
    } else {
      console.log('Internal Error txs summaries');
      this.fnSetFetchError('transaction summaries', 'Error: Internal RPC Error');
      return {};
    }
    const txSummariesJSON = JSON.parse(txSummariesStr);

    return txSummariesJSON.transaction_summaries;
  }
  */

  async zingolibValueTransfers() {
    // fetch transaction value transfers
    const txValueTransfersStr: string = native.zingolib_get_value_transfers();
    if (txValueTransfersStr) {
      if (txValueTransfersStr.toLowerCase().startsWith('error')) {
        console.log(`Error txs ValueTransfers ${txValueTransfersStr}`);
        this.fnSetFetchError('transaction ValueTransfers', txValueTransfersStr);
        return {};
      }
    } else {
      console.log('Internal Error txs ValueTransfers');
      this.fnSetFetchError('transaction ValueTransfers', 'Error: Internal RPC Error');
      return {};
    }
    const txValueTransfersJSON = JSON.parse(txValueTransfersStr);

    return txValueTransfersJSON.value_transfers;
  }

  // This method will get the total balances
  async fetchTotalBalance() {
    //const balanceStr = native.zingolib_execute_async("balance", "");
    //const balanceJSON = JSON.parse(balanceStr);

    const balanceJSON: any = await this.zingolibBalance();

    //console.log(balanceJSON);

    // Total Balance
    const balance = new TotalBalance();
    balance.obalance = balanceJSON.obalance / 10 ** 8;
    balance.verifiedO = balanceJSON.verified_obalance / 10 ** 8;
    balance.unverifiedO = balanceJSON.unverified_obalance / 10 ** 8;
    balance.spendableO = balanceJSON.spendable_obalance / 10 ** 8;
    balance.zbalance = balanceJSON.zbalance / 10 ** 8;
    balance.transparent = balanceJSON.tbalance / 10 ** 8;
    balance.verifiedZ = balanceJSON.verified_zbalance / 10 ** 8;
    balance.unverifiedZ = balanceJSON.unverified_zbalance / 10 ** 8;
    balance.spendableZ = balanceJSON.spendable_zbalance / 10 ** 8;
    balance.total = balance.obalance + balance.zbalance + balance.transparent;
    this.fnSetTotalBalance(balance);

    // Fetch pending notes and UTXOs
    // const pendingNotes = native.zingolib_execute_async("notes", "");
    // const pendingJSON = JSON.parse(pendingNotes); 

    const pendingJSON: any = await this.zingolibNotes();

    const pendingAddressBalances = new Map();

    // Process orchard + sapling notes
    pendingJSON.pending_notes.forEach((s: any) => {
      pendingAddressBalances.set(s.address, s.value);
    });

    // Process UTXOs
    pendingJSON.pending_utxos.forEach((s: any) => {
      pendingAddressBalances.set(s.address, s.value);
    });

    // Addresses with Balance. The client reports balances in zatoshi, so divide by 10^8;
    const uaddresses = balanceJSON.ua_addresses.map((o: any) => {
      // If this has any unconfirmed txns, show that in the UI
      const ab = new Address(o.address, o.balance / 10 ** 8, o.address_type);
      if (pendingAddressBalances.has(ab.address)) {
        ab.containsPending = true;
      }
      // Add receivers to unified addresses
      let receivers: ReceiverType[] = [];
      if (o.receivers.orchard_exists) receivers.push(ReceiverType.orchard);
      if (o.receivers.transparent) receivers.push(ReceiverType.transparent);
      if (o.receivers.sapling) receivers.push(ReceiverType.sapling);
      ab.receivers = receivers;
      ab.type = o.address_type;
      return ab;
    });
    // I need all the addresses here
    //.filter((ab: Address) => ab.balance > 0);

    const zaddresses = balanceJSON.z_addresses.map((o: any) => {
      // If this has any unconfirmed txns, show that in the UI
      const ab = new Address(o.address, o.zbalance / 10 ** 8, o.address_type);
      if (pendingAddressBalances.has(ab.address)) {
        ab.containsPending = true;
      }
      ab.type = o.address_type;
      return ab;
    });
    // I need all the addresses here
    //.filter((ab: Address) => ab.balance > 0);

    //console.log(zaddresses);

    const taddresses = balanceJSON.t_addresses.map((o: any) => {
      // If this has any unconfirmed txns, show that in the UI
      const ab = new Address(o.address, o.balance / 10 ** 8, o.address_type);
      if (pendingAddressBalances.has(ab.address)) {
        ab.containsPending = true;
      }
      ab.type = o.address_type;
      return ab;
    });
    // I need all the addresses here
    //.filter((ab: Address) => ab.balance > 0);

    const addresses = uaddresses.concat(zaddresses.concat(taddresses));

    this.fnSetAddresses(addresses);
  }

  static getLastTxid(): string {
    const txListStr: string = native.zingolib_get_value_transfers();
    const txListJSON = JSON.parse(txListStr);

    console.log('=============== get Last TX ID', txListJSON.value_transfers.length); 

    if (txListJSON.value_transfers && txListJSON.value_transfers.length && txListJSON.value_transfers.length > 0) {
      return txListJSON.value_transfers[txListJSON.length - 1].txid;
    } else {
      return "0";
    }
  }

  static async getPrivKeyAsString(address: string): Promise<string> {
    const privKeyStr: string = await native.zingolib_execute_async("export", address);
    const privKeyJSON = JSON.parse(privKeyStr);

    return privKeyJSON[0].private_key;
  }

  static async getViewKeyAsString(address: string): Promise<string> {
    const privKeyStr: string = await native.zingolib_execute_async("export", address);
    const privKeyJSON = JSON.parse(privKeyStr);

    return privKeyJSON[0].viewing_key;
  }

  static async createNewAddress(type: AddressType) {
    // Zingolib creates addresses like this:
    // ozt = orchard + sapling + transparent (orchard unified)
    // o = orchard only
    // oz = orchard + sapling
    // ot = orchard + transparent
    // zt = spling + transparent
    // z = sapling only
    // it's not possible to create a transparent only address
    const addrStr: string = await native.zingolib_execute_async(
      "new",
      type === AddressType.unified ? "ozt" : type === AddressType.sapling ? "oz" : "ot"
    );
    const addrJSON = JSON.parse(addrStr);

    return addrJSON[0];
  }

  static async fetchSeed(): Promise<string> {
    const seedStr: string = await native.zingolib_execute_async("seed", "");
    const seedJSON = JSON.parse(seedStr);

    return seedJSON.seed;
  }

  static async fetchUfvk(): Promise<string> {
    const ufvkStr: string = await native.zingolib_execute_async("exportufvk", "");
    const ufvkJSON = JSON.parse(ufvkStr);

    return ufvkJSON.ufvk;
  }

  static async fetchBirthday(): Promise<number> {
    const walletKindStr: string = await native.zingolib_execute_async("wallet_kind", "");
    const walletKindJSON = JSON.parse(walletKindStr);

    if (walletKindJSON.kind === "Seeded") {
      // seed
      const seedStr: string = await native.zingolib_execute_async("seed", ""); 
      const seedJSON = JSON.parse(seedStr);

      return seedJSON.birthday;
    } else {
      // ufvk
      const ufvkStr: string = await native.zingolib_execute_async("exportufvk", "");
      const ufvkJSON = JSON.parse(ufvkStr);

      return ufvkJSON.birthday;
    } 
  }

  static async fetchWalletHeight(): Promise<number> {
    const heightStr: string = await native.zingolib_execute_async("height", "");
    const heightJSON = JSON.parse(heightStr);

    return heightJSON.height;
  }

  /*
  // Fetch all T and Z and O transactions
  async fetchTandZandOTransactionsSummaries(latestBlockHeight: number) {
    const summariesJSON: any = await this.zingolibTxSummaries();

    console.log('summaries antes ', summariesJSON);

    let txList: Transaction[] = [];

    const walletHeight: number = await RPC.fetchWalletHeight();

    summariesJSON
      //.filter(tx => tx.kind !== 'Fee')
      .forEach((tx: any) => {
        let currentTxList: Transaction[] = txList.filter(t => t.txid === tx.txid);
        if (currentTxList.length === 0) {
          currentTxList = [{} as Transaction];
          currentTxList[0].txDetails = [];
        }
        let restTxList: Transaction[] = txList.filter(t => t.txid !== tx.txid);

        const type = tx.kind === 'Fee' ? 'Sent' : tx.kind;
        if (!currentTxList[0].type && !!type) {
          currentTxList[0].type = type;
        }
        // unconfirmed means 0 confirmations, the tx is mining already.
        if (tx.unconfirmed) {
          currentTxList[0].confirmations = null;
        } else  if (!currentTxList[0].confirmations) {
          currentTxList[0].confirmations = latestBlockHeight
            ? latestBlockHeight - tx.block_height + 1
            : walletHeight - tx.block_height + 1;
        }
        if (!currentTxList[0].txid && !!tx.txid) {
          currentTxList[0].txid = tx.txid;
        }
        if (!currentTxList[0].time && !!tx.datetime) {
          currentTxList[0].time = tx.datetime;
        }
        if (!currentTxList[0].zec_price && !!tx.price && tx.price !== 'None') {
          currentTxList[0].zec_price = tx.price;
        }

        //if (tx.txid.startsWith('426e')) {
        //  console.log('tran: ', tx);
        //  console.log('--------------------------------------------------');
        //}

        let currenttxdetails: TxDetail = {} as TxDetail;
        if (tx.kind === 'Fee') {
          currentTxList[0].fee = (currentTxList[0].fee ? currentTxList[0].fee : 0) + tx.amount / 10 ** 8;
          if (currentTxList[0].txDetails.length === 0) {
            // when only have 1 item with `Fee`, we assume this tx is `SendToSelf`.
            currentTxList[0].type = 'SendToSelf';
            currenttxdetails.address = '';
            currenttxdetails.amount = 0;
            currentTxList[0].txDetails.push(currenttxdetails);
          }
        } else {
          currenttxdetails.address = !tx.to_address || tx.to_address === 'None' ? '' : tx.to_address;
          currenttxdetails.amount = tx.amount / 10 ** 8;
          currenttxdetails.memos = !tx.memos ? undefined : tx.memos;
          currenttxdetails.pool = !tx.pool || tx.pool === 'None' ? undefined : tx.pool;
          currentTxList[0].txDetails.push(currenttxdetails);
        }

        //currentTxList[0].txDetails.forEach(det => console.log(det.memos));
        //console.log(currentTxList[0]);
        txList = [...currentTxList, ...restTxList];
      });

    //console.log('summaries despues', txList);

    // Now, combine the amounts and memos
    const combinedTxList: Transaction[] = [];
    txList.forEach((txns: Transaction) => {
      //console.log(txns.txDetails.length); 
      const combinedTx = txns;
      if (txns.type === 'Sent' || txns.type === 'SendToSelf') {
        // using address for `Sent` & `SendToSelf`
        combinedTx.txDetails = RPC.combineTxDetailsByAddress(txns.txDetails);
      } else {
        // using pool for `Received`
        combinedTx.txDetails = RPC.combineTxDetailsByPool(txns.txDetails);
      }

      //combinedTx.txDetails.forEach(det => console.log(det.memos));
      //console.log(combinedTx);
      combinedTxList.push(combinedTx);
    });

    //console.log(combinedTxList);

    this.fnSetTransactionsList(combinedTxList);
  }
  */

  // Fetch all T and Z and O transactions value transfers
  async fetchTandZandOValueTransfers(latestBlockHeight: number) {
    const valueTransfersJSON: any = await this.zingolibValueTransfers();

    //console.log('value transfers antes ', valueTransfersJSON);

    let txList: Transaction[] = [];

    const walletHeight: number = await RPC.fetchWalletHeight();

    valueTransfersJSON
      .forEach((tx: any) => {
        let currentTxList: Transaction = {} as Transaction;

        currentTxList.txid = tx.txid;
        currentTxList.time = tx.datetime;
        currentTxList.type = tx.kind;
        currentTxList.fee = (!tx.transaction_fee ? 0 : tx.transaction_fee) / 10 ** 8;
        currentTxList.zec_price = !tx.zec_price ? 0 : tx.zec_price;

        // unconfirmed means 0 confirmations, the tx is mining already.
        if (tx.status === 'pending') {
          currentTxList.confirmations = 0;
        } else  if (tx.status === 'confirmed') {
          currentTxList.confirmations = latestBlockHeight
            ? latestBlockHeight - tx.blockheight + 1
            : walletHeight - tx.blockheight + 1;
        } else {
          // impossible case... I guess.
          currentTxList.confirmations = 0;
        }
        
        currentTxList.address = !tx.recipient_address ? undefined : tx.recipient_address;
        currentTxList.amount = (!tx.value ? 0 : tx.value) / 10 ** 8;
        currentTxList.memos = !tx.memos || tx.memos.length === 0 ? undefined : tx.memos;
        currentTxList.pool = !tx.pool_received ? undefined : tx.pool_received;

        //if (tx.txid.startsWith('426e')) {
        //  console.log('valuetranfer: ', tx);
        //  console.log('--------------------------------------------------');
        //}

        txList.push(currentTxList);
      });

    //console.log(TxList);

    this.fnSetTransactionsList(txList);
  }


  /*
  // We combine detailed transactions if they are sent to the same outgoing address in the same txid. This
  // is usually done to split long memos.
  // Remember to add up both amounts and combine memos
  static combineTxDetailsByAddress(txdetails: TxDetail[]): TxDetail[] {
    // First, group by outgoing address.
    //console.log(txdetails);
    const m = new Map<string, TxDetail[]>();
    txdetails
      .filter(i => i.address !== undefined)
      .forEach(i => {
        const coll = m.get(i.address as string);
        if (!coll) {
          m.set(i.address as string, [i]);
        } else {
          coll.push(i);
        }
      });
    
    //console.log(m);

    // Reduce the groups to a single TxDetail, combining memos and summing amounts
    const reducedDetailedTxns: TxDetail[] = [];
    m.forEach((txns, toaddr) => {
      const totalAmount = txns.reduce((sum, i) => sum + i.amount, 0);

      const memos = txns
        .filter(i => i.memos && i.memos.length > 0)
        .map(i => {
          const combinedMemo = i.memos
            ?.filter(memo => memo)
            .map(memo => {
              const rex = /\((\d+)\/(\d+)\)((.|[\r\n])*)/;
              const tags = memo.match(rex);
              if (tags && tags.length >= 4) {
                return { num: parseInt(tags[1], 10), memo: tags[3] };
              }

              // Just return as is
              return { num: 0, memo };
            })
            .sort((a, b) => a.num - b.num)
            .map(a => a.memo);
          return combinedMemo && combinedMemo.length > 0 ? combinedMemo.join('') : undefined;
        })
        .map(a => a);

      const detail: TxDetail = {
        address: toaddr,
        amount: totalAmount,
        memos: memos && memos.length > 0 ? [memos.join('')] : undefined,
      };

      //console.log(detail);

      reducedDetailedTxns.push(detail);
    });

    //console.log(reducedDetailedTxns);

    return reducedDetailedTxns;
  }

  // We combine detailed transactions if they are received to the same pool in the same txid. This
  // is usually done to split long memos.
  // Remember to add up both amounts and combine memos
  static combineTxDetailsByPool(txdetails: TxDetail[]): TxDetail[] {
    // First, group by pool.
    const m = new Map<'Orchard' | 'Sapling' | 'Transparent', TxDetail[]>();
    txdetails
      .filter(i => i.pool !== undefined)
      .forEach(i => {
        const coll = m.get(i.pool as 'Orchard' | 'Sapling' | 'Transparent');
        if (!coll) {
          m.set(i.pool as 'Orchard' | 'Sapling' | 'Transparent', [i]);
        } else {
          coll.push(i);
        }
      });

    // Reduce the groups to a single TxDetail, combining memos and summing amounts
    const reducedDetailedTxns: TxDetail[] = [];
    m.forEach((txns, pool) => {
      const totalAmount = txns.reduce((sum, i) => sum + i.amount, 0);

      const memos = txns
        .filter(i => i.memos && i.memos.length > 0)
        .map(i => {
          const combinedMemo = i.memos
            ?.filter(memo => memo)
            .map(memo => {
              const rex = /\((\d+)\/(\d+)\)((.|[\r\n])*)/;
              const tags = memo.match(rex);
              if (tags && tags.length >= 4) {
                return { num: parseInt(tags[1], 10), memo: tags[3] };
              }

              // Just return as is
              return { num: 0, memo };
            })
            .sort((a, b) => a.num - b.num)
            .map(a => a.memo);
          return combinedMemo && combinedMemo.length > 0 ? combinedMemo.join('') : undefined;
        })
        .map(a => a);

      const detail: TxDetail = {
        address: '',
        amount: totalAmount,
        memos: memos && memos.length > 0 ? [memos.join('')] : undefined,
        pool: pool,
      };

      reducedDetailedTxns.push(detail);
    });

    return reducedDetailedTxns;
  }
  */

  // Send a transaction using the already constructed sendJson structure
  async sendTransaction(sendJson: SendManyJsonType[], setSendProgress: (p?: SendProgress) => void): Promise<string> {
    // First, get the previous send progress id, so we know which ID to track
    const prevProgressStr: string = await native.zingolib_execute_async("sendprogress", "");
    const prevProgressJSON = JSON.parse(prevProgressStr);
    const prevSendId: number = prevProgressJSON.id;

    try {
      console.log(`Sending ${JSON.stringify(sendJson)}`);
      const resp: string = await native.zingolib_execute_async("send", JSON.stringify(sendJson));
      console.log(`End Sending, response: ${resp}`); 
    } catch (err) {
      // TODO Show a modal with the error
      console.log(`Error sending Tx: ${err}`);
      throw err;
    }

    const startTimeSeconds: number = new Date().getTime() / 1000;

    // The send command is async, so we need to poll to get the status
    const sendTxPromise: Promise<string> = new Promise((resolve, reject) => {
      const intervalID = setInterval(async () => {
        const progressStr: string = await native.zingolib_execute_async("sendprogress", "");
        const progressJSON = JSON.parse(progressStr);
        console.log(progressJSON);

        const updatedProgress = new SendProgress();
        if (progressJSON.id === prevSendId) {
          // Still not started, so wait for more time
          setSendProgress(updatedProgress);
          return;
        }

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

        if (progressJSON.id === prevSendId) {
          // Still not started, so wait for more time
          setSendProgress(updatedProgress);
          return;
        }

        if (!progressJSON.txid && !progressJSON.error) {
          // Still processing
          setSendProgress(updatedProgress);
          return;
        }

        // Finished processing
        clearInterval(intervalID);
        setSendProgress(undefined);

        if (progressJSON.txid) {
          // And refresh data (full refresh)
          this.refresh(true);

          resolve(progressJSON.txid as string);
        }

        if (progressJSON.error) {
          reject(progressJSON.error as string);
        }
      }, 2 * 1000); // Every 2 seconds
    });

    return sendTxPromise;
  }

  async encryptWallet(password: string): Promise<boolean> {
    const resultStr: string = await native.zingolib_execute_async("encrypt", password);
    const resultJSON = JSON.parse(resultStr);

    // To update the wallet encryption status
    this.fetchInfo();

    // And save the wallet
    //RPC.doSave();

    return resultJSON.result === "success";
  }

  async decryptWallet(password: string): Promise<boolean> {
    const resultStr: string = await native.zingolib_execute_async("decrypt", password);
    const resultJSON = JSON.parse(resultStr);

    // To update the wallet encryption status
    this.fetchInfo();

    // And save the wallet
    //RPC.doSave();

    return resultJSON.result === "success";
  }

  async lockWallet(): Promise<boolean> {
    const resultStr: string = await native.zingolib_execute_async("lock", "");
    const resultJSON = JSON.parse(resultStr);

    // To update the wallet encryption status
    this.fetchInfo();

    return resultJSON.result === "success";
  }

  async unlockWallet(password: string): Promise<boolean> {
    const resultStr: string = await native.zingolib_execute_async("unlock", password);
    const resultJSON = JSON.parse(resultStr);

    // To update the wallet encryption status
    this.fetchInfo();

    return resultJSON.result === "success";
  }

  async getZecPrice() {
    const resultStr: string = await native.zingolib_execute_async("updatecurrentprice", "");

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
