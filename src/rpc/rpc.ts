import {
  TotalBalance,
  ValueTransfer,
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
  fnSetValueTransfersList: (t: ValueTransfer[]) => void;
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
    fnSetValueTransfersList: (t: ValueTransfer[]) => void,
    fnSetInfo: (info: Info) => void,
    fnSetZecPrice: (p?: number) => void,
    fnSetWalletSettings: (settings: WalletSettings) => void,
    fnSetVerificationProgress: (verificationProgress: number) => void,
    fnSetFetchError: (command: string, error: string) => void,
  ) {
    this.fnSetTotalBalance = fnSetTotalBalance;
    this.fnSetAddresses = fnSetAddresses;
    this.fnSetValueTransfersList = fnSetValueTransfersList;
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

  static deinitialize() {
    const str: string = native.zingolib_deinitialize();
    console.log(`Deinitialize status: ${str}`);
  }
  
  // shield transparent balance to orchard
  async shieldTransparentBalanceToOrchard(): Promise<string> {
    const shieldResult: string = await native.zingolib_execute_async("shield", '');
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

    const confirmResult: string = await native.zingolib_execute_async("confirm", '');
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
    await this.fetchTandZandOValueTransfers(latestBlockHeight);
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
            // verificationProgress = 100;
            // And fetch the rest of the data.
            this.fetchTotalBalance();
            this.fetchTandZandOValueTransfers(latestBlockHeight);
      
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

  async zingolibValueTransfers() {
    // fetch value transfers
    const txValueTransfersStr: string = native.zingolib_get_value_transfers();
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

  // Fetch all T and Z and O value transfers
  async fetchTandZandOValueTransfers(latestBlockHeight: number) {
    const valueTransfersJSON: any = await this.zingolibValueTransfers();

    //console.log('value transfers antes ', valueTransfersJSON);

    let txList: ValueTransfer[] = [];

    const walletHeight: number = await RPC.fetchWalletHeight();

    valueTransfersJSON
      .forEach((tx: any) => {
        let currentTxList: ValueTransfer = {} as ValueTransfer;

        currentTxList.txid = tx.txid;
        currentTxList.time = tx.datetime;
        currentTxList.type = tx.kind;
        currentTxList.fee = (!tx.transaction_fee ? 0 : tx.transaction_fee) / 10 ** 8;
        currentTxList.zec_price = !tx.zec_price ? 0 : tx.zec_price;

        // unconfirmed means 0 confirmations, the tx is mining already.
        if (tx.status === 'pending') {
          currentTxList.confirmations = 0;
        } else  if (tx.status === 'confirmed') {
          currentTxList.confirmations = latestBlockHeight && latestBlockHeight >= walletHeight
            ? latestBlockHeight - tx.blockheight + 1
            : walletHeight - tx.blockheight + 1;
        } else {
          // impossible case... I guess.
          currentTxList.confirmations = 0;
        }
        if (currentTxList.confirmations < 0) {
          console.log('[[[[[[[[[[[[[[[[[[', tx, 'server', latestBlockHeight, 'wallet', walletHeight);
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

    this.fnSetValueTransfersList(txList);
  }

  // Send a transaction using the already constructed sendJson structure
  async sendTransaction(sendJson: SendManyJsonType[], setSendProgress: (p?: SendProgress) => void): Promise<string> {
    // First, get the previous send progress id, so we know which ID to track
    const prevProgressStr: string = await native.zingolib_execute_async("sendprogress", "");
    const prevProgressJSON = JSON.parse(prevProgressStr);
    const prevSendId: number = prevProgressJSON.id;
    let sendTxids: string = '';

    // proposing...
    try {
      console.log(`Sending ${JSON.stringify(sendJson)}`);
      const resp: string = await native.zingolib_execute_async("send", JSON.stringify(sendJson));
      console.log(`End Sending, response: ${resp}`); 
    } catch (err) {
      // TODO Show a modal with the error
      console.log(`Error sending Tx: ${err}`);
      throw err;
    }

    // sending...
    try {
      console.log('Confirming');
      const resp: string = await native.zingolib_execute_async("confirm", "");
      console.log(`End Confirming, response: ${resp}`);
      if (resp.toLowerCase().startsWith('error')) {
        console.log(`Error confirming Tx: ${resp}`);
        throw Error(resp);  
      } else {
        const respJSON = JSON.parse(resp);
        if (respJSON.error) {
          console.log(`Error confirming Tx: ${respJSON.error}`);
          throw Error(respJSON.error);
        } else if (respJSON.txids) {
          sendTxids = respJSON.txids.join(', ');
        } else {
          console.log(`Error confirming: no error, no txids `);
          throw Error('Error confirming: no error, no txids');
        }
      }
    } catch (err) {
      // TODO Show a modal with the error
      console.log(`Error confirming Tx: ${err}`);
      throw err;
    }

    const startTimeSeconds: number = new Date().getTime() / 1000;

    // The send command is async, so we need to poll to get the status
    const sendTxPromise: Promise<string> = new Promise((resolve, reject) => {
      const intervalID = setInterval(async () => {
        const progressStr: string = await native.zingolib_execute_async("sendprogress", "");
        const progressJSON = JSON.parse(progressStr);
        
        const updatedProgress = new SendProgress();
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

        if (!progressJSON.txid && !progressJSON.error && !sendTxids) {
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

        if (sendTxids) {
          // And refresh data (full refresh)
          this.refresh(true);

          resolve(sendTxids as string);
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
