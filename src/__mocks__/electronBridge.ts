export const native = {
  parse_address: jest.fn(),
  get_seed: jest.fn(),
  get_ufvk: jest.fn(),
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
