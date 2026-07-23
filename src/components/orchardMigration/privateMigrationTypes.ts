// Shapes returned by the native private-migration FFI (parsed JSON). These
// mirror exactly what native/src/lib.rs serializes from zingolib's parts/buckets
// migration engine. All values are in zatoshis unless noted.
//
//   plan_ironwood_migration  -> FfiPlan   (the Phase 1 plan; its hash = consent)
//   start_ironwood_migration -> begins the flow (needs the consented hash)
//   migration_status         -> FfiStatus (phase, parts, next wakes)
//   broadcast_due_parts /    -> send parts whose window is open (foreground:
//     auto_broadcast_if_due     zingo-pc only broadcasts while the app is open)
//   reconcile_migration      -> applies safe-unattended part-state fixes

// Result of the immediate one-call migration (migrate_to_ironwood): the
// Orchard->Orchard split transactions, the Orchard->Ironwood part transactions,
// and any value left as dust.
export type FfiMigrationSummary = {
  split_txids: string[];
  part_txids: string[];
  stranded: number;
};

// One Phase 1 note-splitting transaction (Orchard -> Orchard).
export type FfiSplitTx = { inputs: number[]; outputs: number[]; fee: number };

// One step of the Phase 1 splitting driver (continue_note_splitting):
//   round_broadcast       -> built + broadcast a round of self-sends; sync until
//                            they confirm, then call again. `txids` are the sent txs.
//   awaiting_confirmation -> nothing written this tick; `pending` is what is still
//                            in flight (empty = confirmed but anchor lagging). Retry.
//   splitting_complete    -> parts bound + scheduled; Phase 1 done.
export type FfiSplitStep =
  | { step: "round_broadcast"; round: number; txids: string[] }
  | { step: "awaiting_confirmation"; pending: string[] }
  | { step: "splitting_complete" };

export type FfiPlan = {
  // Note-splitting rounds (empty when the notes are already standardized).
  split_rounds: FfiSplitTx[][];
  // Denominations of the parts to send to Ironwood, largest first.
  parts: number[];
  // Value left as dust (below the migration threshold).
  stranded: number;
  split_fee: number;
  parts_fee: number;
  // True when no note splitting is required (parts can schedule immediately).
  is_split: boolean;
  // Consent digest handed back to start_ironwood_migration (hex).
  plan_hash: string;
};

// One future broadcast window (zingolib WakePoint). `denominations` (zatoshis)
// mirror `part_ids` element-for-element, so a schedule screen can render each
// window's batch without a second call. `estimated_unix_time` is when the
// window OPENS (its boundary); `estimated_target_unix_time` is when the batch
// actually broadcasts (its randomized in-window target) — use the latter for
// "when will this send".
export type FfiWake = {
  bucket_index: number;
  boundary: number;
  part_ids: number[];
  denominations: number[];
  estimated_unix_time: number;
  estimated_target_unix_time: number;
};

// Coarse migration phase. `null` when no migration is in progress.
export type FfiPhase =
  | { kind: "planned" }
  | { kind: "note_splitting"; round: number; pending_txids: string[] }
  | { kind: "parts_scheduled" }
  | { kind: "complete"; residual: number };

export type FfiStatus = {
  in_progress: boolean;
  orchard_confirmed_spendable: number;
  phase: FfiPhase | null;
  parts_total: number;
  parts_confirmed: number;
  value_total: number;
  value_migrated: number;
  // Effective cadence: how many parts share each broadcast window (null before
  // start) and the bucket count the boundaries index into.
  per_bucket: number | null;
  bucket_modulus: number;
  next_wakes: FfiWake[];
};
