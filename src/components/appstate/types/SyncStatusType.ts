import { SyncStatusScanRangeType } from "./SyncStatusScanRangeType";

export type SyncStatusType = {
  scan_ranges?: SyncStatusScanRangeType[];
  sync_start_height?: number;
  session_blocks_scanned?: number;
  total_blocks_scanned?: number;
  percentage_session_blocks_scanned?: number | null;
  percentage_total_blocks_scanned?: number | null;
  session_sapling_outputs_scanned?: number;
  total_sapling_outputs_scanned?: number;
  session_orchard_outputs_scanned?: number;
  total_orchard_outputs_scanned?: number;
  percentage_session_outputs_scanned?: number | null;
  percentage_total_outputs_scanned?: number | null;
  // from poll sync
  lastError?: string;
  // Set while no sync session is running and the app is not starting another,
  // because the engine said this server cannot serve the wallet. The figures
  // above are then the last ones a session published and the chain has moved
  // on past them: "100% synced" is a statement about a moment that has gone.
  stopped?: boolean;
};
