import { shieldQuoteSaysNotYet } from "./shieldQuote";

describe("shieldQuoteSaysNotYet", () => {
  // What a wallet mid-scan answers with, whole, as it reached the screen.
  it("reads a quote refused for funds that are not scanned yet", () => {
    expect(
      shieldQuoteSaysNotYet(
        "Change output generation failed: Insufficient funds: required 10000 zatoshis, but only 0 zatoshis were available.",
      ),
    ).toBe(true);
  });

  it("reads a quote refused because the scan has not caught up", () => {
    expect(shieldQuoteSaysNotYet("proposal failed: ScanRequired")).toBe(true);
    expect(shieldQuoteSaysNotYet("a scan required before this can be proposed")).toBe(true);
  });

  // A fault is still a fault, and still worth the red line.
  it("leaves anything else to be reported", () => {
    expect(shieldQuoteSaysNotYet("the wallet returned no shielding quote")).toBe(false);
    expect(shieldQuoteSaysNotYet("server error ← transport error ← Timeout expired")).toBe(false);
    expect(shieldQuoteSaysNotYet("wallet file is corrupt")).toBe(false);
  });
});
