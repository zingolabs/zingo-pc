export default class WalletSettingsClass {
    download_memos: string;
    transaction_filter_threshold: number;
  
    constructor() {
      this.download_memos = "wallet";
      this.transaction_filter_threshold = 0;
    }
  }
  