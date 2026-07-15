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
  // NU6.3 / Ironwood activation height for this chain, read from zingolib. 0 = unknown.
  nu63ActivationHeight: number;
  // Happy-path Orchard→Ironwood drain plan (zingolib plan_orchard_drain), in ZEC.
  // orchardMigratable = value that can move to Ironwood; orchardDust = value
  // stranded below the migration threshold. Sentinel -1 = "not checked yet" (so a
  // freshly-loaded balance is never mistaken for dust before the plan is fetched);
  // exactly 0 + an Orchard balance = all dust.
  orchardMigratable: number;
  orchardDust: number;
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
    this.nu63ActivationHeight = 0;
    this.orchardMigratable = -1;
    this.orchardDust = 0;
    this.error = error;
    this.zingolib = "";
  }
}
