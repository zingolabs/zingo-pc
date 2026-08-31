import {
  deriveMixnetView,
  UNKNOWN_MIXNET_VIEW,
  MixnetView,
  describeSendRoute,
  describeMixnetDeath,
} from "./mixnetPresenter";
import { RPCMixnetStatusType } from "./RPCMixnetStatusType";

describe("deriveMixnetView", () => {
  it("projects each of the five wire states to its screen view", () => {
    const cases: [RPCMixnetStatusType, MixnetView][] = [
      [
        { mode: "unattached" },
        {
          statusKey: "mixnet.status.unattached",
          socks5Addr: null,
          narration: null,
          sendBlocked: true,
          recovery: "reenable",
          death: null,
        },
      ],
      [
        { mode: "switched_off" },
        {
          statusKey: "mixnet.status.off",
          socks5Addr: null,
          narration: null,
          sendBlocked: false,
          recovery: "reenable",
          death: null,
        },
      ],
      [
        { mode: "bootstrapping", bootstrap_detail: "connecting to gateway" },
        {
          statusKey: "mixnet.status.bootstrapping",
          socks5Addr: null,
          narration: "connecting to gateway",
          sendBlocked: true,
          recovery: "wait",
          death: null,
        },
      ],
      [
        { mode: "ready", socks5_addr: "127.0.0.1:1080" },
        {
          statusKey: "mixnet.status.ready",
          socks5Addr: "127.0.0.1:1080",
          narration: null,
          sendBlocked: false,
          recovery: "none",
          death: null,
        },
      ],
      [
        { mode: "died", death: { at: 1753900000000 } },
        {
          statusKey: "mixnet.status.died",
          socks5Addr: null,
          narration: null,
          sendBlocked: true,
          recovery: "reenable",
          death: { at: 1753900000000 },
        },
      ],
    ];

    for (const [status, view] of cases) {
      expect(deriveMixnetView(status)).toEqual(view);
    }
  });

  it("blocks sending in every state except ready and switched_off (fail-closed)", () => {
    const modes: RPCMixnetStatusType["mode"][] = ["unattached", "switched_off", "bootstrapping", "ready", "died"];
    const unblocked = modes.filter((mode) => !deriveMixnetView({ mode }).sendBlocked);
    expect(unblocked).toEqual(["switched_off", "ready"]);
  });

  it("drops an empty bootstrap narration to null", () => {
    expect(deriveMixnetView({ mode: "bootstrapping", bootstrap_detail: "" }).narration).toBeNull();
  });

  it("keeps sends blocked on an unknown (failed) read", () => {
    expect(UNKNOWN_MIXNET_VIEW.sendBlocked).toBe(true);
  });
});

describe("describeSendRoute", () => {
  // Two of the five states are working routes, not failures: a ready mixnet and
  // a deliberate opt-out both send, one privately and one over clearnet.
  it("names the route when the mixnet carries the send", () => {
    expect(describeSendRoute(deriveMixnetView({ mode: "ready", socks5_addr: "127.0.0.1:1080" }))).toMatch(
      /over the Nym mixnet/,
    );
  });

  it("names clearnet when the user switched the mixnet off", () => {
    const text = describeSendRoute(deriveMixnetView({ mode: "switched_off" }));
    expect(text).toMatch(/over clearnet/);
    expect(text).not.toMatch(/waits/);
  });

  it("says what is being waited for while bootstrapping, narration included", () => {
    const text = describeSendRoute(deriveMixnetView({ mode: "bootstrapping", bootstrap_detail: "3 of 5 hops" }));
    expect(text).toMatch(/waits/);
    expect(text).toMatch(/3 of 5 hops/);
  });

  it("offers the way out in the states nobody consented to", () => {
    for (const mode of ["unattached", "died"] as const) {
      expect(describeSendRoute(deriveMixnetView({ mode }))).toMatch(/switch it off to send over clearnet/);
    }
  });

  it("says something for every state, so the route is never a mystery", () => {
    const modes: RPCMixnetStatusType["mode"][] = ["unattached", "switched_off", "bootstrapping", "ready", "died"];
    for (const mode of modes) {
      expect(describeSendRoute(deriveMixnetView({ mode })).length).toBeGreaterThan(0);
    }
  });
});

describe("describeMixnetDeath", () => {
  it("says the stage, the target, and the chain outermost-first", () => {
    expect(
      describeMixnetDeath({
        at: 1753900000000,
        detail: {
          stage: "socks-handshake",
          target: "https://indexer.example:443",
          cause_chain: ["price fetch failed", "connection reset by peer"],
        },
      }),
    ).toBe("the SOCKS handshake against https://indexer.example:443 — price fetch failed ← connection reset by peer");
  });

  it("renders a timeout with the bound it exceeded", () => {
    expect(
      describeMixnetDeath({
        at: 1753900000000,
        detail: { stage: { "timed-out": { after_ms: 25000 } }, target: "https://indexer.example:443", cause_chain: [] },
      }),
    ).toBe("timed out after 25s against https://indexer.example:443");
  });

  // The transport is allowed to die without a held cause, and an empty line
  // reads worse than no line: the caller renders nothing.
  it("has nothing to say when no cause was held", () => {
    expect(describeMixnetDeath({ at: 1753900000000 })).toBeNull();
    expect(describeMixnetDeath(null)).toBeNull();
  });
});
