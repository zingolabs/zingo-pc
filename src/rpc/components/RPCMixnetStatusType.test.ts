import type { RPCMixnetStatusType, RPCNetOpStage } from "./RPCMixnetStatusType";

// The golden wire pins, byte-for-byte identical to zingolib's
// nym::driver::wire_contract test. A drift on either side is a breaking change
// to the neon boundary: this suite fails in TS, that one fails in Rust, and the
// pins are never blessed away without a deliberate revision on both.
const UNATTACHED = '{"mode":"unattached"}';
const SWITCHED_OFF = '{"mode":"switched_off"}';
const BOOTSTRAPPING = '{"mode":"bootstrapping","bootstrap_detail":"connecting to gateway"}';
const READY = '{"mode":"ready","socks5_addr":"127.0.0.1:1080"}';
const DIED_WITH_CAUSE =
  '{"mode":"died","death":{"at":1753900000000,"detail":{"stage":{"timed-out":{"after_ms":25000}},"target":"https://indexer.example:443","cause_chain":["deadline elapsed"]}}}';
const DIED_NO_CAUSE = '{"mode":"died","death":{"at":1753900000000}}';

describe("MixnetStatus wire contract", () => {
  it("parses each golden pin to its canonical value and round-trips the bytes", () => {
    const cases: [string, RPCMixnetStatusType][] = [
      [UNATTACHED, { mode: "unattached" }],
      [SWITCHED_OFF, { mode: "switched_off" }],
      [BOOTSTRAPPING, { mode: "bootstrapping", bootstrap_detail: "connecting to gateway" }],
      [READY, { mode: "ready", socks5_addr: "127.0.0.1:1080" }],
      [
        DIED_WITH_CAUSE,
        {
          mode: "died",
          death: {
            at: 1753900000000,
            detail: {
              stage: { "timed-out": { after_ms: 25000 } },
              target: "https://indexer.example:443",
              cause_chain: ["deadline elapsed"],
            },
          },
        },
      ],
      [DIED_NO_CAUSE, { mode: "died", death: { at: 1753900000000 } }],
    ];

    for (const [pin, value] of cases) {
      expect(JSON.parse(pin)).toEqual(value);
      expect(JSON.stringify(value)).toEqual(pin);
    }
  });

  it("carries a died cause as a typed variant, not a substring", () => {
    const parsed = JSON.parse(DIED_WITH_CAUSE) as RPCMixnetStatusType;
    // A consumer reads the stage as data: a string is a unit stage, an object
    // is the parameterized timeout. Neither is ever pattern-matched on prose.
    const stage: RPCNetOpStage | undefined = parsed.death?.detail?.stage;
    expect(typeof stage === "object" && stage["timed-out"].after_ms).toBe(25000);
  });
});
