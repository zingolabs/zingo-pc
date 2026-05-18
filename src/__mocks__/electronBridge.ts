export const native = {
  parse_address: jest.fn(),
  get_seed: jest.fn(),
  get_ufvk: jest.fn(),
  // LoadingScreen
  wallet_exists: jest.fn(),
  wallet_kind: jest.fn(),
  init_from_b64: jest.fn(),
  set_crypto_default_provider_to_ring: jest.fn(),
  set_wallet_base_dir: jest.fn(),
  start_security_scoped_access: jest.fn(),
  get_latest_block_server: jest.fn(),
  // Send
  send: jest.fn(),
  get_spendable_balance_with_address: jest.fn(),
  // History
  remove_transaction: jest.fn(),
  // Insight
  get_total_value_to_address: jest.fn(),
  get_total_number_of_sends: jest.fn(),
  get_total_spends_to_address: jest.fn(),
  get_total_memobytes_to_address: jest.fn(),
};

export const clipboard = {
  writeText: jest.fn(),
};

export const shell = {
  openExternal: jest.fn(),
};

export const ipcRenderer = {
  on: jest.fn(),
  off: jest.fn(),
  invoke: jest.fn(),
  send: jest.fn(),
};

export const fs = {
  promises: { readFile: jest.fn(), writeFile: jest.fn() },
  existsSync: jest.fn(),
};

export const isSandboxed = false;
