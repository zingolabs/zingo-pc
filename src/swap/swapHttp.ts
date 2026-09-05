import { ipcRenderer } from "../electronBridge";

export type SwapHttpResponse = {
  ok: boolean;
  status: number;
  text: string;
};

/**
 * One HTTP request for the swap layer, performed in the main process.
 *
 * The renderer cannot reach these hosts itself: its CSP allows `connect-src`
 * to none of them, and in the packaged app it runs from a `file://` origin
 * that CORS refuses cross-origin requests from. The ZNS resolver and the
 * server registry are in main for the same reasons, so this follows them
 * rather than widening the policy for the swap layer alone.
 *
 * The deadline crosses as a number because an `AbortSignal` cannot travel over
 * IPC. Main applies it, and its own cap, so an abort still cuts the request
 * even though the controller stays on this side.
 *
 * Main answers with the status and body rather than a `Response`, which is why
 * this returns a small shape instead of pretending to be `fetch`. The callers
 * only ever read those three fields.
 */
export function swapHttpRequest(args: {
  url: string;
  method: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs: number;
}): Promise<SwapHttpResponse> {
  return ipcRenderer.invoke("swapHttp:request", args);
}
