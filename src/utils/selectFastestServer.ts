import { ServerClass } from "../components/appstate";
import { native } from "../electronBridge";

// Matches zingo-mobile's app/selectingServer.ts, which uses the same budget for
// the same race.
const PROBE_TIMEOUT_MS = 15 * 1000;

// A server's round-trip for one latest-block call, or null when it does not
// answer. `get_latest_block_server` opens its own connection to the URI rather
// than going through the open wallet, so this measures the server and nothing
// else.
const latencyOf = async (server: ServerClass): Promise<number | null> => {
  const start: number = Date.now();
  try {
    const resp: string = await native.get_latest_block_server(server.uri);
    return resp ? Date.now() - start : null;
  } catch (error) {
    console.error(`Critical Error calculate server latency ${error}`);
    return null;
  }
};

/**
 * The first server to answer, carrying the latency it answered in, or null if
 * none does within 15 seconds.
 *
 * A race rather than a full sweep: the winner is whoever replies first, so a
 * long list costs no more than a short one. Servers that never answer simply
 * never resolve, which is why the timeout is the floor of the whole thing.
 */
const selectFastestServer = async (servers: ServerClass[]): Promise<ServerClass | null> => {
  // Racing an empty list would sit out the full timeout waiting for nobody.
  if (servers.length === 0) {
    return null;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), PROBE_TIMEOUT_MS);
  });

  const answered = servers.map(
    (server: ServerClass) =>
      new Promise<ServerClass>((resolve) => {
        latencyOf(server).then((latency: number | null) => {
          if (latency !== null) {
            resolve({ ...server, latency });
          }
        });
      }),
  );

  const fastest = await Promise.race([...answered, expiry]);
  clearTimeout(timer);
  return fastest;
};

export default selectFastestServer;
