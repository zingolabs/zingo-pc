import { deriveMixnetView, UNKNOWN_MIXNET_VIEW, MixnetView } from "./mixnetPresenter";
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
