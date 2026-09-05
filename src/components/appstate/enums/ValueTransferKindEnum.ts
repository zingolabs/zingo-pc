export enum ValueTransferKindEnum {
  sent = "sent",
  memoToSelf = "memo-to-self",
  shield = "shield",
  received = "received",
  sendToSelf = "send-to-self",
  rejection = "rejection",
  // An Orchard -> Ironwood (NU6.3) migration. Not a zingolib kind: it is a
  // send-to-self funded from Orchard and received into Ironwood, derived from
  // the pool movement in rpc.ts and surfaced as its own history type.
  migration = "migration",
  // A cross-chain swap. Not a zingolib kind either: the record lives in the
  // swap store, and `swapRecordToValueTransfer` projects it into a history row
  // so swaps and on-chain transfers share one list.
  swap = "swap",
}
