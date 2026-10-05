import { buildId } from "./buildId";

describe("buildId", () => {
  it("names the version, the build and the commit", () => {
    expect(buildId("2.0.26 (194)", "1a2b3c4")).toBe("zpc_2.0.26-194_1a2b3c4");
  });

  it("goes without the commit when the build had none to read", () => {
    expect(buildId("2.0.26 (194)", "")).toBe("zpc_2.0.26-194");
  });
});
