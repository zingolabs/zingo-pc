import { ServerChainNameEnum } from "../enums/ServerChainNameEnum";

export interface WalletType {
  id: number;
  fileName: string;
  alias: string;
  chain_name: ServerChainNameEnum;
  creationType: 'Seed' | 'Ufvk' | 'File' | 'Main';
  last_total_balance?: number;
  last_block_height?: number;
}
