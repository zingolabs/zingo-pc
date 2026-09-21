import { isConnectionFailure, syncFailureMessage } from "./syncFailureMessage";

describe("syncFailureMessage", () => {
  // What a wallet left in the background long enough reports when it wakes up.
  it("says a dropped connection in one sentence", () => {
    const reason =
      "sync: server error ← server request failed ← code: 'The operation was cancelled', " +
      'message: "Timeout expired", source: tonic::transport::Error(Transport, TimeoutExpired(())) ' +
      "← transport error ← Timeout expired";
    expect(isConnectionFailure(reason)).toBe(true);
    expect(syncFailureMessage(reason)).toBe("The server stopped answering — reconnecting.");
  });

  it.each([
    "transport error: error trying to connect: tcp connect error: Connection refused (os error 111)",
    'status: Unavailable, message: "error trying to connect"',
    "dns error: failed to lookup address information",
  ])("recognises %s as the connection failing", (reason) => {
    expect(syncFailureMessage(reason)).toBe("The server stopped answering — reconnecting.");
  });

  // Anything the wallet knows about itself is a fact we have no better words for.
  it("leaves the wallet's own refusals alone", () => {
    const reason = "sync: wallet height 34100000 is more than 100 blocks ahead of best chain height 3470916";
    expect(isConnectionFailure(reason)).toBe(false);
    expect(syncFailureMessage(reason)).toBe(reason);
  });
});
