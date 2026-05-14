import getSendManyJSON from "./getSendManyJSON";
import { SendPageStateClass, ToAddrClass } from "../../appstate";

// utils.ts (imported by getSendManyJSON) reads electronBridge at module load time
jest.mock("../../../electronBridge");

const makePageState = (overrides: Partial<ToAddrClass> = {}) =>
  ({
    toaddr: {
      to: "u1fakeaddress0000000000000000000000000000000000000000",
      amount: 1,
      memo: "",
      memoReplyTo: "",
      ...overrides,
    } as ToAddrClass,
  }) as SendPageStateClass;

// ---------------------------------------------------------------------------
// Amount conversion
// ---------------------------------------------------------------------------
describe("amount conversion", () => {
  it("converts 1 ZEC to 100000000 zatoshi", () => {
    const [tx] = getSendManyJSON(makePageState({ amount: 1 }));
    expect(tx.amount).toBe(100_000_000);
  });

  it("converts 0.001 ZEC to 100000 zatoshi", () => {
    const [tx] = getSendManyJSON(makePageState({ amount: 0.001 }));
    expect(tx.amount).toBe(100_000);
  });

  it("converts 0.00000001 ZEC (1 zatoshi) correctly", () => {
    const [tx] = getSendManyJSON(makePageState({ amount: 0.00000001 }));
    expect(tx.amount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// No memo
// ---------------------------------------------------------------------------
describe("transaction without memo", () => {
  it("produces a single output with undefined memo", () => {
    const result = getSendManyJSON(makePageState({ memo: "", memoReplyTo: "" }));
    expect(result).toHaveLength(1);
    expect(result[0].memo).toBeUndefined();
  });

  it("carries the destination address through", () => {
    const to = "u1fakeaddress0000000000000000000000000000000000000000";
    const [tx] = getSendManyJSON(makePageState({ to }));
    expect(tx.address).toBe(to);
  });
});

// ---------------------------------------------------------------------------
// Short memo (≤ 512 bytes)
// ---------------------------------------------------------------------------
describe("transaction with short memo", () => {
  it("includes the memo as-is in a single output", () => {
    const result = getSendManyJSON(makePageState({ memo: "Hello Zcash!" }));
    expect(result).toHaveLength(1);
    expect(result[0].memo).toBe("Hello Zcash!");
  });

  it("concatenates memo and memoReplyTo", () => {
    const result = getSendManyJSON(makePageState({ memo: "Hi", memoReplyTo: " there" }));
    expect(result).toHaveLength(1);
    expect(result[0].memo).toBe("Hi there");
  });

  it("handles memo at exactly 512 bytes without splitting", () => {
    const memo = "a".repeat(512);
    const result = getSendManyJSON(makePageState({ memo }));
    expect(result).toHaveLength(1);
    expect(result[0].memo).toBe(memo);
  });
});

// ---------------------------------------------------------------------------
// Long memo (> 512 bytes) — split into multiple outputs
// ---------------------------------------------------------------------------
describe("transaction with long memo", () => {
  const longMemo = "x".repeat(600);

  it("produces more than one output", () => {
    const result = getSendManyJSON(makePageState({ memo: longMemo }));
    expect(result.length).toBeGreaterThan(1);
  });

  it("first output carries the full ZEC amount", () => {
    const result = getSendManyJSON(makePageState({ memo: longMemo }));
    expect(result[0].amount).toBe(100_000_000);
  });

  it("subsequent outputs have amount 0", () => {
    const result = getSendManyJSON(makePageState({ memo: longMemo }));
    for (let i = 1; i < result.length; i++) {
      expect(result[i].amount).toBe(0);
    }
  });

  it("all outputs share the same destination address", () => {
    const to = "u1fakeaddress0000000000000000000000000000000000000000";
    const result = getSendManyJSON(makePageState({ memo: longMemo, to }));
    for (const tx of result) {
      expect(tx.address).toBe(to);
    }
  });

  it("memo parts are prefixed with (x/y) sequence markers", () => {
    const result = getSendManyJSON(makePageState({ memo: longMemo }));
    const total = result.length;
    result.forEach((tx, i) => {
      expect(tx.memo).toMatch(new RegExp(`^\\(${i + 1}/${total}\\)`));
    });
  });

  it("reassembling stripped parts reconstructs the original memo", () => {
    const result = getSendManyJSON(makePageState({ memo: longMemo }));
    const reassembled = result.map((tx) => tx.memo!.replace(/^\(\d+\/\d+\)/, "")).join("");
    expect(reassembled).toBe(longMemo);
  });
});
