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
}
