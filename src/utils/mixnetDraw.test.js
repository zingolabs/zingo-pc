// The main-process decision about a draw. It never runs in the renderer, so this
// reaches into public/ directly.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ATTACH_GRACE_MS, BOOTSTRAP_REDRAW_LIMIT, drawVerdict } = require("../../public/mixnetDraw");

const unproven = { hasAddress: true, walletMode: "bootstrapping", attachAgeMs: ATTACH_GRACE_MS, redrawsSpent: 0 };

describe("a draw's deadline", () => {
  it("redraws a draw that listens and never proves itself", () => {
    expect(drawVerdict(unproven)).toBe("redraw");
  });

  // Redrawing here would kill the bootstrap still under way.
  it("waits for a proxy that is not listening yet", () => {
    expect(drawVerdict({ ...unproven, hasAddress: false, attachAgeMs: null })).toBe("wait");
  });

  it.each(["ready", "previously_proven_this_epoch"])("leaves a proven draw alone (%s)", (walletMode) => {
    expect(drawVerdict({ ...unproven, walletMode })).toBe("settled");
  });

  it("leaves a death to the reconnect path", () => {
    expect(drawVerdict({ ...unproven, walletMode: "died" })).toBe("settled");
  });

  // A wallet that opened after the proxy came up has not had its time.
  it("waits while no wallet has been offered the draw, or only just", () => {
    expect(drawVerdict({ ...unproven, attachAgeMs: null })).toBe("wait");
    expect(drawVerdict({ ...unproven, attachAgeMs: ATTACH_GRACE_MS - 1 })).toBe("wait");
  });

  // Past the limit it stops drawing, or a dead server would redraw forever.
  it("stops redrawing at the limit", () => {
    expect(drawVerdict({ ...unproven, redrawsSpent: BOOTSTRAP_REDRAW_LIMIT - 1 })).toBe("redraw");
    expect(drawVerdict({ ...unproven, redrawsSpent: BOOTSTRAP_REDRAW_LIMIT })).toBe("settled");
  });
});
