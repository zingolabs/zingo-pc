// Rows are added and removed by position, so each needs an identity that is
// not its index: React's key, and the handle every update names.
let nextToAddrId: number = 1;

export default class ToAddrClass {
  id: number;
  to: string;
  amount: number;
  memo: string;
  memoReplyTo: string;
  // When the user typed a ZNS alias (e.g. "pepe.zcash") and it resolved,
  // `to` holds the resolved UA and `znsAlias` keeps the original alias so the
  // UI badge can survive page navigation (Send ↔ AddressBook).
  znsAlias: string;

  constructor() {
    this.id = nextToAddrId++;
    this.to = "";
    this.amount = 0;
    this.memo = "";
    this.memoReplyTo = "";
    this.znsAlias = "";
  }

  /**
   * Whether anything has been put into this row. The screen opens with one
   * untouched row, and filling the form from outside replaces that row rather
   * than adding a recipient beside an empty one.
   */
  static hasContent(toaddr: ToAddrClass): boolean {
    return !!toaddr.to || toaddr.amount > 0 || !!toaddr.memo;
  }
}
