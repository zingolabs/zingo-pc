/**
 * @jest-environment node
 */
// The main-process half of the doctor. It never runs in the renderer, so this
// reaches into public/ directly and drives it against local sockets.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const net = require("net");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  CLUTCH_SIZE,
  createJournal,
  dialLocalProxy,
  drawClutch,
  parseDiscovery,
  probeThroughTunnel,
  withoutCutLegs,
} = require("../../public/mixnetDoctor");

describe("a run whose proxy was replaced under it", () => {
  const failed = { ok: false, millis: 8000, target: "x:443", stages: [], error: "read ECONNRESET" };
  const passed = { ok: true, millis: 3000, target: "x:443", stages: [] };
  const legs = {
    listener: { ok: true, millis: 1 },
    tunnelServer: failed,
    tunnelControl: { skipped: "the server is the control" },
    walletProbe: [{ host: "x", millis: 1, failure: { stage: "s", target: "t", cause_chain: [] } }],
  };

  it("keeps every leg while the proxy is the one it measured", () => {
    expect(withoutCutLegs(legs, "127.0.0.1:1", "127.0.0.1:1")).toBe(legs);
  });

  it("does not count a cut socket as a failed route, and keeps what passed", () => {
    const kept = withoutCutLegs({ ...legs, tunnelControl: passed }, "127.0.0.1:1", null);
    expect(kept.tunnelServer).toEqual({ skipped: "the proxy was replaced during the measurement" });
    expect(kept.walletProbe).toEqual({ skipped: "the proxy was replaced during the measurement" });
    expect(kept.tunnelControl).toBe(passed);
    expect(kept.listener).toBe(legs.listener);
  });
});

// A listener that answers each connection however the test says, closed after.
const withServer = async (onConnection, run) => {
  const server = net.createServer(onConnection);
  const sockets = new Set();
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("error", () => {});
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    return await run(`127.0.0.1:${server.address().port}`);
  } finally {
    sockets.forEach((socket) => socket.destroy());
    await new Promise((resolve) => server.close(resolve));
  }
};

// A SOCKS5 proxy that greets, then answers the CONNECT with `reply`.
const socksProxy = (reply) => (socket) => {
  let greeted = false;
  socket.on("data", () => {
    if (!greeted) {
      greeted = true;
      socket.write(Buffer.from([0x05, 0x00]));
    } else {
      socket.write(Buffer.from([0x05, reply, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
    }
  });
};

describe("the journal", () => {
  it("keeps the newest entries and drops the oldest past its limit", () => {
    const journal = createJournal({ limit: 2, now: () => 7 });

    journal.note("info", "proxy", "one");
    journal.note("warn", "proxy", "two");
    journal.note("error", "proxy", "three");

    expect(journal.list()).toEqual([
      { at: 7, level: "warn", source: "proxy", text: "two" },
      { at: 7, level: "error", source: "proxy", text: "three" },
    ]);
  });
});

describe("the clutch", () => {
  it("reads each identity once, whatever else the proxy printed", () => {
    expect(parseDiscovery("NYM_EXIT=a\r\nNYM_EXIT=b\nsomething else\nNYM_EXIT=a\nNYM_EXIT=\n")).toEqual(["a", "b"]);
  });

  it("draws the race's size without repeating an exit", () => {
    const exits = Array.from({ length: 50 }, (_, i) => `exit-${i}`);

    const clutch = drawClutch(exits);

    expect(clutch).toHaveLength(CLUTCH_SIZE);
    expect(new Set(clutch).size).toBe(CLUTCH_SIZE);
    clutch.forEach((exit) => expect(exits).toContain(exit));
  });

  it("takes every exit when the directory lists fewer than the race holds", () => {
    expect(drawClutch(["a", "b"]).sort()).toEqual(["a", "b"]);
  });
});

describe("the local proxy dial", () => {
  it("passes a listener that speaks SOCKS5", () =>
    withServer(socksProxy(0), async (addr) => {
      expect((await dialLocalProxy(addr)).ok).toBe(true);
    }));

  // A listener accepting TCP is the mirage this exists to see through.
  it("fails a listener that accepts and says nothing", () =>
    withServer(
      () => {},
      async (addr) => {
        const outcome = await dialLocalProxy(addr, { boundMs: 100 });
        expect(outcome.ok).toBe(false);
        expect(outcome.error).toMatch(/no answer/);
      },
    ));

  it("fails a port nothing listens on", async () => {
    const addr = await withServer(
      () => {},
      async (open) => open,
    );

    expect((await dialLocalProxy(addr)).ok).toBe(false);
  });
});

describe("the tunnel probe", () => {
  it("reports a refusal from the exit in words, at the stage it happened", () =>
    withServer(socksProxy(2), async (addr) => {
      const outcome = await probeThroughTunnel(addr, "indexer.test", 443);

      expect(outcome.ok).toBe(false);
      expect(outcome.target).toBe("indexer.test:443");
      expect(outcome.error).toBe("refused by the exit's policy");
      expect(outcome.stages[outcome.stages.length - 1]).toMatchObject({ step: "socks-connect", ok: false });
    }));

  // The case the probe exists for: a proxy says yes to the CONNECT and nothing
  // ever comes back. The SOCKS reply alone would have called this healthy.
  it("does not take a SOCKS success as proof, only a handshake from the far side", () =>
    withServer(socksProxy(0), async (addr) => {
      const outcome = await probeThroughTunnel(addr, "indexer.test", 443, { boundMs: 200 });

      expect(outcome.ok).toBe(false);
      expect(outcome.stages.map((stage) => stage.step)).toEqual(["local-proxy", "socks-connect", "tls"]);
      expect(outcome.stages[1].ok).toBe(true);
      expect(outcome.stages[2].ok).toBe(false);
    }));

  it("asks for the server by name, so nothing resolves it on this side", () => {
    const seen = [];
    return withServer(
      (socket) => {
        socket.on("data", (chunk) => {
          seen.push(chunk);
          if (seen.length === 1) socket.write(Buffer.from([0x05, 0x00]));
          else socket.write(Buffer.from([0x05, 0x04, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
        });
      },
      async (addr) => {
        await probeThroughTunnel(addr, "indexer.test", 443);

        const connect = seen[1];
        expect(connect[3]).toBe(0x03);
        expect(connect.subarray(5, 5 + connect[4]).toString()).toBe("indexer.test");
        expect(connect.readUInt16BE(5 + connect[4])).toBe(443);
      },
    );
  });
});
