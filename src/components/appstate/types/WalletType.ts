import { ServerChainNameEnum } from "../enums/ServerChainNameEnum";

export interface WalletType {
  id: number;
  fileName: string;
  alias: string;
  chain_name: ServerChainNameEnum;
  last_total_balance?: number;
  last_block_height?: number;
}
