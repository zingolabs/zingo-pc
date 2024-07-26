export function zingolib_get_latest_block_height(server_uri: string): string;
export function zingolib_wallet_exists(server_uri: string, chain_hint: string): boolean;
export function zingolib_init_new(server_uri: string, chain_hint: string): string;
export function zingolib_init_from_seed(
  server_uri: string,
  seed: string,
  birthday: number,
  chain_hint: string
): string;
export function zingolib_init_from_ufvk(
  server_uri: string,
  ufvk: string,
  birthday: number,
  chain_hint: string
): string;
export function zingolib_init_from_b64(server_uri: string, chain_hint: string): string;
export function zingolib_deinitialize(): string;
export function zingolib_execute_spawn(cmd: string, args: string): string;
export function zingolib_execute_async(cmd: string, args: string): Promise<string>;
export function zingolib_get_transaction_summaries(): string;
export function zingolib_get_value_transfers(): string;
