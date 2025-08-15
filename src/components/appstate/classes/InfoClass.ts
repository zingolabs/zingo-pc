import { ServerChainNameEnum } from "../enums/ServerChainNameEnum";

export default class InfoClass {
    chainName: ServerChainNameEnum;
    latestBlock: number;
    connections: number;
    version: string;
    currencyName: string;
    solps: number;
    zecPrice: number;
    zcashdVersion: string;
    walletHeight: number;
    error?: string;
    zingolib: string;
  
    constructor(error?: string) {
      this.chainName = ServerChainNameEnum.mainChainName;
      this.latestBlock = 0;
      this.connections = 0;
      this.version = "";
      this.zcashdVersion = "";
      this.currencyName = "";
      this.solps = 0;
      this.zecPrice = 0;
      this.walletHeight = 0;
      this.error = error;
      this.zingolib = "";
    }
  }
  