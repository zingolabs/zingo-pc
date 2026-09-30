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

  // The verdict outranks the prose. A server that cannot serve this wallet
  // says so in terms of a protocol value the user never chose, and the only
  // thing they can do about it is use a different server.
  it("says what to do when the server cannot serve the wallet", () => {
    const reason =
      "sync: server error ← server request failed ← code: 'Client specified an invalid argument', " +
      'message: "Error: Invalid shielded protocol value."';

    expect(syncFailureMessage(reason, "server_unavailable")).toBe(
      "This server cannot serve this wallet. Switch to another server.",
    );
  });

  // zingolib reads the failure's own source chain before classifying it, so a
  // timed-out request comes back as recoverable and keeps the sentence that
  // says the wallet is reconnecting.
  it("reads a timed-out request as the connection, not the server", () => {
    const reason =
      "server error ← server request failed ← code: 'The operation was cancelled', " +
      'message: "Timeout expired" ← transport error ← Timeout expired';

    expect(syncFailureMessage(reason, "maybe_recoverable_server")).toBe("The server stopped answering — reconnecting.");
  });

  // The same failure text, classified as transient, is the ordinary dropped
  // connection and keeps its own sentence.
  it("keeps the reconnecting sentence for a failure the library calls recoverable", () => {
    expect(syncFailureMessage("transport error ← Timeout expired", "maybe_recoverable_server")).toBe(
      "The server stopped answering — reconnecting.",
    );
  });

  // Anything the wallet knows about itself is a fact we have no better words for.
  it("leaves the wallet's own refusals alone", () => {
    const reason = "sync: wallet height 34100000 is more than 100 blocks ahead of best chain height 3470916";
    expect(isConnectionFailure(reason)).toBe(false);
    expect(syncFailureMessage(reason)).toBe(reason);
  });
});
