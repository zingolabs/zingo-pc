export default class ToAddrClass {
  to: string;
  amount: number;
  memo: string;
  memoReplyTo: string;
  // When the user typed a ZNS alias (e.g. "pepe.zcash") and it resolved,
  // `to` holds the resolved UA and `znsAlias` keeps the original alias so the
  // UI badge can survive page navigation (Send ↔ AddressBook).
  znsAlias: string;

  constructor() {
    this.to = "";
    this.amount = 0;
    this.memo = "";
    this.memoReplyTo = "";
    this.znsAlias = "";
  }
}
