export class WalletSettings {
    download_memos: string;
    spam_filter_threshold: number;
  
    constructor() {
      this.download_memos = "wallet";
      this.spam_filter_threshold = 0;
    }
  }
  