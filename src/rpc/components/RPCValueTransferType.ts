import { ValueTransferKindEnum, ValueTransferStatusEnum } from "../../components/appstate";

export type RPCValueTransferType = {
  txid: string;
  datetime: number;
  kind: ValueTransferKindEnum;
  transaction_fee?: number;
  zec_price?: number;
  status: ValueTransferStatusEnum;
  blockheight: number;
  recipient_address?: string;
  value?: number;
  memos?: string[];
  // zingolib PR #2466: replaced the single `pool_received` with two pool lists.
  // Raw JSON pool names are capitalized ("Orchard", "Ironwood", …); rpc.ts
  // normalizes them to the lowercase ValueTransferPoolEnum.
  pools_sent_from?: string[];
  pools_received?: string[];
};
