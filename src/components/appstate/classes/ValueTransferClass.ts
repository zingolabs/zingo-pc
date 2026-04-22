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
  address: string;
  amount: number;
  memos?: string[];
  pool?: ValueTransferPoolEnum;

  constructor(
    type: ValueTransferKindEnum,
    confirmations: number,
    blockheight: number,
    status: ValueTransferStatusEnum,
    txid: string,
    time: number,
    address: string,
    amount: number,
  ) {
    this.type = type;
    this.confirmations = confirmations;
    this.blockheight = blockheight;
    this.status = status;
    this.txid = txid;
    this.time = time;
    this.address = address;
    this.amount = amount;
  }
}
