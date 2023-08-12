export function zingolib_say_hello(s: string): string;
export function zingolib_wallet_exists(server_uri: string): boolean;
export function zingolib_initialize_new(server_uri: string): string;
export function zingolib_initialize_new_from_phrase(
  server_uri: string,
  seed: string,
  birthday: number,
  overwrite: boolean
): string;
export function zingolib_initialize_existing(server_uri: string): string;
export function zingolib_deinitialize(): string;
export function zingolib_execute_spawm(cmd: string, args: string): Promise<string>;
export function zingolib_execute_async(cmd: string, args: string): Promise<string>;
