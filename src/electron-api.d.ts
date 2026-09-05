import * as NativeAPI from "./native.node";

// All native methods are exposed to the renderer via IPC, so sync methods become
// async. This mapped type wraps every sync return value in Promise<>.
type RendererNativeAPI = {
  [K in keyof typeof NativeAPI]: (typeof NativeAPI)[K] extends (...args: infer A) => infer R
    ? R extends Promise<any>
      ? (...args: A) => R
      : (...args: A) => Promise<R>
    : (typeof NativeAPI)[K];
};

declare global {
  interface Window {
    electronAPI: {
      native: RendererNativeAPI;
      isSandboxed: boolean;
      clipboard: {
        writeText: (text: string) => void;
      };
      shell: {
        openExternal: (url: string) => void;
      };
      ipcRenderer: {
        /**
         * Subscribe, and take back the only thing that can unsubscribe.
         *
         * There is no `off`. A renderer cannot name a listener the preload
         * would recognise — contextBridge proxies functions on the way across
         * — so a channel-and-callback removal silently removes nothing. The
         * returned disposer closes over the registration itself.
         */
        on: (channel: string, listener: (...args: any[]) => void) => () => void;
        invoke: (channel: string, ...args: any[]) => Promise<any>;
        send: (channel: string, ...args: any[]) => void;
      };
      fs: {
        existsSync: (path: string) => Promise<boolean>;
        promises: {
          mkdir: (path: string, options?: any) => Promise<void>;
          writeFile: (path: string, data: string) => Promise<void>;
          readFile: (path: string) => Promise<string>;
        };
      };
    };
  }
}
