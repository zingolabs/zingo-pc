// The main-process half of the Nym doctor: what main saw happen to the transport
// and what it can measure on its own. It lives here rather than in electron.js so
// a test can drive it without Electron, the way serverRegistry.js does.

const net = require("net");
const tls = require("tls");

// A long enough tail to hold a night of retries at the 60s ceiling, each of which
// writes a handful of lines.
const JOURNAL_LIMIT = 1000;

// zingo-netutils RESERVATION_CLUTCH_SIZE. The exits one bootstrap races.
const CLUTCH_SIZE = 4;

// zingo-netutils MIXNET_ROUND_TRIP_BOUND. A cold tunnel's first data has tails
// far above the healthy ~3s, so a shorter bound would report a slow tunnel as a
// dead one.
const TUNNEL_BOUND_MS = 30_000;
const LOCAL_BOUND_MS = 5_000;

const SOCKS_REPLIES = {
  1: "general failure",
  2: "refused by the exit's policy",
  3: "network unreachable",
  4: "host unreachable",
  5: "connection refused",
  6: "TTL expired",
  7: "command not supported",
  8: "address type not supported",
};

// Held in memory only and gone with the session. It names servers and exits with
// timestamps, which is a record of when this wallet was active, so it reaches
// disk only if the user copies the report somewhere themselves.
function createJournal({ limit = JOURNAL_LIMIT, now = Date.now } = {}) {
  const entries = [];
  return {
    note(level, source, text) {
      entries.push({ at: now(), level, source, text });
      if (entries.length > limit) entries.shift();
    },
    list: () => entries.slice(),
  };
}

// The identities a `--discover` run printed, each once.
function parseDiscovery(stdout) {
  const exits = new Set();
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("NYM_EXIT=")) {
      const exit = trimmed.slice("NYM_EXIT=".length).trim();
      if (exit) exits.add(exit);
    }
  }
  return [...exits];
}

// A uniform draw without replacement, zingolib's draw_clutch. Passing the clutch
// is also what makes the proxy narrate: run with no `--exit` it draws its own and
// reports nothing until it either serves or exits.
function drawClutch(exits, size = CLUTCH_SIZE, random = Math.random) {
  const pool = exits.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, size);
}

function hostAndPort(addr) {
  const at = addr.lastIndexOf(":");
  return { host: addr.slice(0, at), port: Number(addr.slice(at + 1)) };
}

// A connected socket as something awaitable: `read(n)` resolves with exactly n
// bytes, and a close or error rejects whatever is waiting.
function openReader(socket) {
  let buffered = Buffer.alloc(0);
  let waiting = null;
  let failure = null;
  const settle = () => {
    if (!waiting) return;
    if (buffered.length >= waiting.n) {
      const chunk = buffered.subarray(0, waiting.n);
      buffered = buffered.subarray(waiting.n);
      const { resolve } = waiting;
      waiting = null;
      resolve(chunk);
    } else if (failure) {
      const { reject } = waiting;
      waiting = null;
      reject(failure);
    }
  };
  const onData = (chunk) => {
    buffered = Buffer.concat([buffered, chunk]);
    settle();
  };
  const onError = (e) => {
    failure = e;
    settle();
  };
  const onClose = () => {
    failure = failure || new Error("the proxy closed the connection");
    settle();
  };
  socket.on("data", onData);
  socket.on("error", onError);
  socket.on("close", onClose);
  return {
    read: (n) =>
      new Promise((resolve, reject) => {
        waiting = { n, resolve, reject };
        settle();
      }),
    // The TLS layer takes the socket over from here.
    release: () => {
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("close", onClose);
    },
  };
}

function connectTcp(addr) {
  return new Promise((resolve, reject) => {
    const { host, port } = hostAndPort(addr);
    const socket = net.connect({ host, port });
    socket.once("connect", () => {
      socket.off("error", reject);
      resolve(socket);
    });
    socket.once("error", reject);
  });
}

async function greet(socket, reader) {
  socket.write(Buffer.from([0x05, 0x01, 0x00]));
  const reply = await reader.read(2);
  if (reply[0] !== 0x05 || reply[1] !== 0x00) {
    throw new Error(`unexpected SOCKS5 greeting ${reply.toString("hex")}`);
  }
}

async function socksConnect(socket, reader, host, port) {
  const name = Buffer.from(host);
  const portBytes = Buffer.alloc(2);
  portBytes.writeUInt16BE(port);
  // By name, never resolved here: a lookup on this side would tell the local
  // resolver which server the tunnel is about to reach.
  socket.write(Buffer.concat([Buffer.from([0x05, 0x01, 0x00, 0x03, name.length]), name, portBytes]));
  const head = await reader.read(4);
  if (head[1] !== 0x00) throw new Error(SOCKS_REPLIES[head[1]] || `SOCKS5 reply ${head[1]}`);
  const addrLength = head[3] === 0x01 ? 4 : head[3] === 0x04 ? 16 : (await reader.read(1))[0];
  await reader.read(addrLength + 2);
}

function tlsHandshake(socket, host) {
  return new Promise((resolve, reject) => {
    // This asks whether bytes cross the tunnel and come back, not whether the
    // server is to be trusted: the wallet verifies the certificate on its own
    // connection, and nothing is sent over this one.
    const secure = tls.connect({ socket, servername: host, ALPNProtocols: ["h2"], rejectUnauthorized: false });
    secure.once("secureConnect", () => {
      secure.destroy();
      resolve();
    });
    secure.once("error", reject);
  });
}

const bounded = (socketHolder, ms, what) =>
  new Promise((_, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`no answer within ${Math.round(ms / 1000)}s ${what}`));
      if (socketHolder.socket) socketHolder.socket.destroy();
    }, ms);
    socketHolder.clear = () => clearTimeout(timer);
  });

// Whether the listener nym-proxy announced still speaks SOCKS5. A greeting and
// not just a TCP accept, though neither says anything about the mixnet behind it.
async function dialLocalProxy(addr, { boundMs = LOCAL_BOUND_MS, now = Date.now } = {}) {
  const started = now();
  const holder = {};
  const work = (async () => {
    holder.socket = await connectTcp(addr);
    await greet(holder.socket, openReader(holder.socket));
  })();
  try {
    await Promise.race([work, bounded(holder, boundMs, "from the local proxy")]);
    return { ok: true, millis: now() - started };
  } catch (e) {
    return { ok: false, millis: now() - started, error: String(e && e.message ? e.message : e) };
  } finally {
    work.catch(() => {});
    if (holder.clear) holder.clear();
    if (holder.socket) holder.socket.destroy();
  }
}

// One server reached through the tunnel, stage by stage, with no wallet involved:
// it works before the wallet has attached, and that is exactly when the wallet's
// own probe refuses. A SOCKS reply alone proves little, since a proxy may answer
// before the exit has connected anywhere, so the verdict rides on the handshake,
// the first bytes known to have come back from the far side.
async function probeThroughTunnel(addr, host, port, { boundMs = TUNNEL_BOUND_MS, now = Date.now } = {}) {
  const started = now();
  const stages = [];
  const holder = {};
  const stage = async (step, run) => {
    const stageStarted = now();
    stages.push({ step, millis: 0, ok: false });
    await run();
    Object.assign(stages[stages.length - 1], { millis: now() - stageStarted, ok: true });
  };
  const work = (async () => {
    await stage("local-proxy", async () => {
      holder.socket = await connectTcp(addr);
    });
    const reader = openReader(holder.socket);
    await stage("socks-connect", async () => {
      await greet(holder.socket, reader);
      await socksConnect(holder.socket, reader, host, port);
    });
    reader.release();
    await stage("tls", () => tlsHandshake(holder.socket, host));
  })();
  try {
    await Promise.race([work, bounded(holder, boundMs, "through the tunnel")]);
    return { ok: true, millis: now() - started, target: `${host}:${port}`, stages };
  } catch (e) {
    return {
      ok: false,
      millis: now() - started,
      target: `${host}:${port}`,
      stages,
      error: String(e && e.message ? e.message : e),
    };
  } finally {
    work.catch(() => {});
    if (holder.clear) holder.clear();
    if (holder.socket) holder.socket.destroy();
  }
}

// Killing a proxy cuts every socket through it, which reads exactly like a route
// that failed. A failure on a proxy that is gone by the end of the run says nothing
// about any route, so it is not kept as one.
function withoutCutLegs(legs, measuredAddr, currentAddr) {
  if (measuredAddr === currentAddr) return legs;
  const cut = (leg) =>
    leg.ok === false || (Array.isArray(leg) && leg[0]?.failure)
      ? { skipped: "the proxy was replaced during the measurement" }
      : leg;
  return {
    ...legs,
    listener: cut(legs.listener),
    tunnelServer: cut(legs.tunnelServer),
    tunnelControl: cut(legs.tunnelControl),
    walletProbe: cut(legs.walletProbe),
  };
}

module.exports = {
  CLUTCH_SIZE,
  createJournal,
  dialLocalProxy,
  drawClutch,
  parseDiscovery,
  probeThroughTunnel,
  withoutCutLegs,
};
