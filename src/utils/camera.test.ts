import { cameraErrorMessage, cameraPlatform } from "./camera";

describe("cameraPlatform", () => {
  it("tells the three desktops apart from the user agent", () => {
    expect(cameraPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)")).toBe("mac");
    expect(cameraPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows");
    expect(cameraPlatform("Mozilla/5.0 (X11; Linux x86_64)")).toBe("linux");
  });
});

describe("cameraErrorMessage", () => {
  // "Denied" alone leaves the user nowhere to go: each OS keeps the switch in
  // a different place.
  it("says where to allow the camera on each platform", () => {
    expect(cameraErrorMessage("NotAllowedError", "mac")).toMatch(/Privacy & Security → Camera/);
    expect(cameraErrorMessage("NotAllowedError", "windows")).toMatch(/Let desktop apps access your camera/);
    expect(cameraErrorMessage("SecurityError", "linux")).toMatch(/not allowed/);
  });

  it("names a missing camera and one held by another app", () => {
    expect(cameraErrorMessage("NotFoundError", "mac")).toBe("No camera was found.");
    expect(cameraErrorMessage("NotReadableError", "windows")).toMatch(/in use by another app/);
  });

  it("falls back to a plain message for anything else", () => {
    expect(cameraErrorMessage(undefined, "linux")).toBe("The camera could not be opened.");
  });
});
