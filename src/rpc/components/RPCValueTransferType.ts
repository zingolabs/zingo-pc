import { ValueTransferKindEnum, ValueTransferPoolEnum, ValueTransferStatusEnum } from "../../components/appstate";

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
  pool_received?: ValueTransferPoolEnum;
};
