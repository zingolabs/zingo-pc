//export function zingolib_say_hello(s: string): string;
export function zingolib_wallet_exists(chain_hint: string): boolean;
export function zingolib_initialize_new(server_uri: string, chain_hint: string): string;
export function zingolib_initialize_existing(server_uri: string, chain_hint: string): string;
export function zingolib_initialize_new_from_phrase(
  server_uri: string,
  seed: string,
  birthday: number,
  overwrite: boolean,
  chain_hint: string
): string;
export function zingolib_initialize_new_from_ufvk(
  server_uri: string,
  ufvk: string,
  birthday: number,
  overwrite: boolean,
  chain_hint: string
): string;
export function zingolib_deinitialize(): string;
export function zingolib_execute_spawn(cmd: string, args: string): Promise<string>;
export function zingolib_execute_async(cmd: string, args: string): Promise<string>;
