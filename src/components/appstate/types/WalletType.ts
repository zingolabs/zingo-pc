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
}
