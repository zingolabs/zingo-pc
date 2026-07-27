import { PerformanceLevelEnum, ServerChainNameEnum } from "./components/appstate";

export function deinitialize(): string;
export function wallet_exists(
  server_uri: string,
  chain_hint: ServerChainNameEnum,
  performance_level: PerformanceLevelEnum,
  min_confirmations: number,
  wallet_name: string,
): boolean;
export function init_new(
  server_uri: string,
  chain_hint: ServerChainNameEnum,
  performance_level: PerformanceLevelEnum,
  min_confirmations: number,
  wallet_name: string,
): string;
export function init_from_seed(
  seed: string,
  birthday: number,
  server_uri: string,
  chain_hint: ServerChainNameEnum,
  performance_level: PerformanceLevelEnum,
  min_confirmations: number,
  wallet_name: string,
): string;
export function init_from_ufvk(
  ufvk: string,
  birthday: number,
  server_uri: string,
  chain_hint: ServerChainNameEnum,
  performance_level: PerformanceLevelEnum,
  min_confirmations: number,
  wallet_name: string,
): string;
export function init_from_b64(
  server_uri: string,
  chain_hint: ServerChainNameEnum,
  performance_level: PerformanceLevelEnum,
  min_confirmations: number,
  wallet_name: string,
): string;
export function save_wallet_file(): Promise<string>;
export function check_save_error(): Promise<string>;
export function get_developer_donation_address(): string;
export function get_zennies_for_zingo_donation_address(): string;
export function set_crypto_default_provider_to_ring(): string;
export function get_seed(): Promise<string>;
export function get_ufvk(): Promise<string>;
export function get_latest_block_server(server_uri: string): Promise<string>;
export function get_latest_block_wallet(): Promise<string>;
export function get_value_transfers(): Promise<string>;
export function poll_sync(): Promise<string>;
export function run_sync(): Promise<string>;
export function pause_sync(): Promise<string>;
export function stop_sync(): Promise<string>;
export function status_sync(): Promise<string>;
export function run_rescan(): Promise<string>;
export function info_server(): Promise<string>;
export function change_server(server_uri: string): Promise<string>;
export function wallet_kind(): Promise<string>;
export function parse_address(address: string): Promise<string>;
export function parse_ufvk(ufvk: string): Promise<string>;
export function get_version(): Promise<string>;
export function get_messages(address: string): Promise<string>;
export function get_balance(): Promise<string>;
export function get_total_memobytes_to_address(): Promise<string>;
export function get_total_value_to_address(): Promise<string>;
export function get_total_spends_to_address(): Promise<string>;
export function zec_price(): Promise<string>;
export function remove_transaction(txid: string): Promise<string>;
export function get_spendable_balance_with_address(address: string, zennies: string): Promise<string>;
export function get_spendable_balance_total(): Promise<string>;
export function set_option_wallet(): Promise<string>;
export function get_unified_addresses(): Promise<string>;
export function get_transparent_addresses(): Promise<string>;
export function create_new_unified_address(receivers: string): Promise<string>;
export function create_new_transparent_address(): Promise<string>;
export function get_wallet_save_required(): Promise<string>;
export function set_config_wallet_to_test(): Promise<string>;
export function set_config_wallet_to_prod(performance_level: string, min_confirmations: number): Promise<string>;
export function get_config_wallet_performance(): Promise<string>;
export function get_wallet_version(): Promise<string>;
export function send(send_json: string): Promise<string>;
export function shield(): Promise<string>;
export function confirm(): Promise<string>;
export function drain_orchard_to_ironwood(): Promise<string>;
export function drain_status(): Promise<string>;
export function get_ironwood_activation_height(): Promise<string>;
export function plan_orchard_drain(): Promise<string>;
// Private (scheduled) Ironwood migration — zingolib parts/buckets engine.
export function plan_ironwood_migration(): Promise<string>;
export function start_ironwood_migration(consented_plan_hash: string, per_bucket: number): Promise<string>;
export function continue_note_splitting(): Promise<string>;
export function reschedule_parts(per_bucket: number): Promise<string>;
export function migration_status(): Promise<string>;
export function reconcile_migration(): Promise<string>;
export function broadcast_due_parts(): Promise<string>;
export function auto_broadcast_if_due(): Promise<string>;
export function catch_up_migration(): Promise<string>;
export function migrate_to_ironwood(): Promise<string>;
export function cancel_ironwood_migration(): Promise<string>;
export function execute_due_parts(spacing_ms: number): Promise<string>;
export function execute_due_parts_status(): Promise<string>;
export function delete_wallet(
  server_uri: string,
  chain_hint: ServerChainNameEnum,
  performance_level: PerformanceLevelEnum,
  min_confirmations: number,
  wallet_name: string,
): Promise<string>;
