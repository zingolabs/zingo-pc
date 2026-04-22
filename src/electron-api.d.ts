import * as NativeAPI from "./native.node";

declare global {
  interface Window {
    electronAPI: {
      native: typeof NativeAPI;
      clipboard: {
        writeText: (text: string) => void;
      };
      shell: {
        openExternal: (url: string) => void;
      };
      ipcRenderer: {
        on: (channel: string, listener: (...args: any[]) => void) => void;
        off: (channel: string, listener: (...args: any[]) => void) => void;
        removeListener: (channel: string, listener: (...args: any[]) => void) => void;
        invoke: (channel: string, ...args: any[]) => Promise<any>;
        send: (channel: string, ...args: any[]) => void;
      };
      fs: {
        existsSync: (path: string) => boolean;
        promises: {
          mkdir: (path: string, options?: any) => Promise<void>;
          writeFile: (path: string, data: string) => Promise<void>;
          readFile: (path: string) => Promise<string>;
        };
      };
    };
  }
}
