import { ValueTransferKindEnum } from "../enums/ValueTransferKindEnum";
import { ValueTransferPoolEnum } from "../enums/ValueTransferPoolEnum";
import { ValueTransferStatusEnum } from "../enums/ValueTransferStatusEnum";

export default class ValueTransferClass {
  type: ValueTransferKindEnum;
  fee?: number;
  confirmations: number;
  blockheight: number;
  status: ValueTransferStatusEnum;
  txid: string;
  time: number;
  zec_price?: number;
  address?: string;
  amount: number;
  memos?: string[];
  // Pool info exposed by zingolib (PR #2466). poolsSentFrom is transaction-level
  // (the pools this txid spent from — identical across all VTs of the txid);
  // poolsReceived is transfer-specific (the destination pools of this movement).
  // Replaces the old single `pool` (was `pool_received`).
  poolsSentFrom?: ValueTransferPoolEnum[];
  poolsReceived?: ValueTransferPoolEnum[];

  constructor(
    type: ValueTransferKindEnum,
    confirmations: number,
    blockheight: number,
    status: ValueTransferStatusEnum,
    txid: string,
    time: number,
    amount: number,
    address?: string,
  ) {
    this.type = type;
    this.confirmations = confirmations;
    this.blockheight = blockheight;
    this.status = status;
    this.txid = txid;
    this.time = time;
    this.amount = amount;
    this.address = address;
  }
}
