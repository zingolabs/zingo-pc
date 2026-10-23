import { CreationTypeEnum } from "../enums/CreationTypeEnum";
import { PerformanceLevelEnum } from "../enums/PerformanceLevelEnum";
import { ServerChainNameEnum } from "../enums/ServerChainNameEnum";
import { ServerSelectionEnum } from "../enums/ServerSelectionEnum";

export interface WalletType {
  id: number;
  fileName: string;
  alias: string;
  chain_name: ServerChainNameEnum;
  creationType: CreationTypeEnum;
  // new fields
  uri: string;
  selection: ServerSelectionEnum;
  performanceLevel: PerformanceLevelEnum;
  /**
   * The file this wallet was last opened from. Kept to say where a wallet
   * that cannot be found was before, never to open it: zingolib resolves the
   * path.
   */
  lastKnownPath?: string;
}
