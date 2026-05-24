import { ServerChainNameEnum } from "../enums/ServerChainNameEnum";

export default class InfoClass {
  chainName: ServerChainNameEnum;
  serverUri: string;
  latestBlock: number;
  connections: number;
  version: string;
  currencyName: string;
  solps: number;
  zcashdVersion: string;
  walletHeight: number;
  error?: string;
  zingolib: string;

  constructor(error?: string) {
    this.chainName = ServerChainNameEnum.mainChainName;
    this.serverUri = "";
    this.latestBlock = 0;
    this.connections = 0;
    this.version = "";
    this.zcashdVersion = "";
    this.currencyName = "";
    this.solps = 0;
    this.walletHeight = 0;
    this.error = error;
    this.zingolib = "";
  }
}
