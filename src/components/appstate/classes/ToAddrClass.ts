export default class ToAddrClass {
  to: string;
  amount: number;
  memo: string;
  memoReplyTo: string;

  constructor() {
    this.to = "";
    this.amount = 0;
    this.memo = "";
    this.memoReplyTo = "";
  }
}
