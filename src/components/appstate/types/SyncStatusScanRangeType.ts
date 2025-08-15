import { SyncStatusScanRangePriorityEnum } from '../enums/SyncStatusScanRangePriorityEnum';

export type SyncStatusScanRangeType = {
  priority: SyncStatusScanRangePriorityEnum,
  start_block: number,
  end_block: number,
};