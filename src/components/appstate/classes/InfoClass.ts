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
  // Estimated fee (ZEC) of the happy-path drain, from the same plan_orchard_drain
  // call as orchardMigratable/orchardDust.
  orchardFee: number;
  // Private (scheduled) Ironwood migration progress. TODO(ffi): populate from
  // zingolib migration_status() once the FFI surfaces it. Defaults describe "no
  // migration in progress", so the Dashboard progress banner stays hidden until
  // one is actually running.
  migrationInProgress: boolean;
  migrationBatchesConfirmed: number;
  migrationBatchesTotal: number;
  migrationPendingZec: number;
  // Blocks until the next scheduled batch window opens.
  migrationNextBlocks: number;
  // True when a migration is in progress but no upcoming window is known yet
  // (the pending parts are waiting for their next witnessable boundary). Drives
  // the banner's "sending automatically, keep the app open" copy instead of a
  // misleading "next batch in ~0 blocks".
  migrationWaiting: boolean;
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
    this.orchardFee = 0;
    this.migrationInProgress = false;
    this.migrationBatchesConfirmed = 0;
    this.migrationBatchesTotal = 0;
    this.migrationPendingZec = 0;
    this.migrationNextBlocks = 0;
    this.migrationWaiting = false;
    this.error = error;
    this.zingolib = "";
  }
}
