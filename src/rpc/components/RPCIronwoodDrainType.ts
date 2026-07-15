// Result of the happy-path Orchard→Ironwood drain (native.drain_orchard_to_ironwood).
// All amounts are in zatoshis.
export type RPCIronwoodDrainType = {
  // The drain transactions, in broadcast order.
  txids: string[];
  // Value sent into the Ironwood pool.
  migrated: number;
  // Total fees paid.
  fee: number;
  // Dust value left unmigrated in the Orchard pool (below the economic threshold).
  dust: number;
};
