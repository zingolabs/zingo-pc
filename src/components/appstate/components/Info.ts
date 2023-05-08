export default class Info {
    testnet: boolean;
    latestBlock: number;
    connections: number;
    version: string;
    currencyName: string;
    solps: number;
    zecPrice: number;
    zcashdVersion: string;
    walletHeight: number;
    error?: string;
  
    constructor(error?: string) {
      this.testnet = false;
      this.latestBlock = 0;
      this.connections = 0;
      this.version = "";
      this.zcashdVersion = "";
      this.currencyName = "";
      this.solps = 0;
      this.zecPrice = 0;
      this.walletHeight = 0;
      this.error = error;
    }
  }
  