/**
 * Every path that spends stops the sync engine first.
 *
 * zingolib pauses the engine around a proposal, but that pause is read inside
 * the scanning loop only. The engine's outer loop, re-entered on every mined
 * block once sync runs continuously, extends the wallet's tree bounds and
 * fills the subtree roots under separate takes of the wallet lock; a spend
 * that reads the tree in between is told the root cannot be computed because
 * nodes are missing. A shield failed exactly that way.
 *
 * So the order is what matters here, not the outcome: the engine is stopped
 * and seen to be stopped before anything is proposed.
 */
import { native } from "../electronBridge";
import RPC from "./rpc";

// Hoisted above the imports by the transform, so the bridge is the mock.
jest.mock("../electronBridge");

const calls: string[] = [];

const answering = (name: string, answer: string) =>
  (native[name as keyof typeof native] as unknown as jest.Mock).mockImplementation(async () => {
    calls.push(name);
    return answer;
  });

const makeRpc = (): RPC => {
  const setters = Array.from({ length: 12 }, () => jest.fn());
  const rpc = new (RPC as unknown as new (...args: unknown[]) => RPC)(...setters, null);
  // The cycle's own ends, which have nothing to do with the order under test.
  jest.spyOn(rpc, "clearTimers").mockImplementation(async () => {});
  jest.spyOn(rpc, "configure").mockImplementation(async () => {
    calls.push("configure");
  });
  return rpc;
};

beforeEach(() => {
  jest.clearAllMocks();
  calls.length = 0;
  answering("stop_sync", "Stopping sync task...");
  // What zingolib answers once the engine has ended.
  answering("poll_sync", "Sync task has not been launched.");
  answering("send", JSON.stringify({ fee: 10000 }));
  answering("shield", JSON.stringify({ value_to_shield: 100000, fee: 10000 }));
  answering("confirm", JSON.stringify({ txids: ["ab12"] }));
  answering("send_swap_deposit", JSON.stringify({ txids: ["cd34", "ef56"] }));
});

describe("a spend runs with the engine stopped", () => {
  it("stops it before a send proposes, and relaunches after", async () => {
    await expect(makeRpc().sendTransaction([{ address: "u1abc", amount: 50000 }])).resolves.toBe("ab12");

    expect(calls).toEqual(["stop_sync", "poll_sync", "send", "confirm", "configure"]);
  });

  it("stops it before a shield proposes, and relaunches after", async () => {
    await expect(makeRpc().shieldTransparentBalanceToIronwood()).resolves.toBe("ab12");

    expect(calls).toEqual(["stop_sync", "poll_sync", "shield", "confirm", "configure"]);
  });

  it("stops it before a swap deposit that sends outright", async () => {
    const txids = await makeRpc().sendSwapDeposit({
      depositAddress: "t1vault",
      amountAtomic: 50000,
      memoBytes: Uint8Array.from([1, 2, 3]),
    });

    expect(txids).toEqual(["cd34", "ef56"]);
    expect(calls).toEqual(["stop_sync", "poll_sync", "send_swap_deposit", "configure"]);
  });

  it("relaunches the engine even when the spend fails", async () => {
    answering("confirm", JSON.stringify({ error: "Send error. ← Unable to compute root" }));

    await expect(makeRpc().shieldTransparentBalanceToIronwood()).rejects.toThrow("Unable to compute root");

    expect(calls[calls.length - 1]).toBe("configure");
  });

  it("waits for the engine to end rather than spending beside it", async () => {
    let polls = 0;
    (native.poll_sync as jest.Mock).mockImplementation(async () => {
      calls.push("poll_sync");
      polls += 1;
      // Still running for the first two answers, as a stopping engine is.
      return polls > 2 ? "Sync task has not been launched." : "Sync task is not complete.";
    });

    await makeRpc().shieldTransparentBalanceToIronwood();

    expect(calls).toEqual(["stop_sync", "poll_sync", "poll_sync", "poll_sync", "shield", "confirm", "configure"]);
  });
});
