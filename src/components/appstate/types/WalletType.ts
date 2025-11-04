import { ServerChainNameEnum } from "../enums/ServerChainNameEnum";

export interface WalletType {
  id: number;
  fileName: string;
  alias: string;
  serveruri: string;
  serverchain_name: ServerChainNameEnum;
  serverselection: 'auto' | 'list' | 'custom';
  last_total_balance?: number;
  last_block_height?: number;
}
