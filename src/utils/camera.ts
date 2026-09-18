/**
 * What to tell the user when the camera cannot be opened, from the error
 * getUserMedia threw and the platform the app runs on.
 *
 * A refusal is the case that needs the platform: each OS keeps the switch in a
 * different place, and "denied" alone leaves the user nowhere to go.
 */
export type CameraPlatform = "mac" | "windows" | "linux";

export function cameraPlatform(userAgent: string = navigator.userAgent): CameraPlatform {
  if (/Mac/i.test(userAgent)) return "mac";
  if (/Windows/i.test(userAgent)) return "windows";
  return "linux";
}

const WHERE_TO_ALLOW: Record<CameraPlatform, string> = {
  mac: "Allow it in System Settings → Privacy & Security → Camera, then try again.",
  windows:
    "Allow it in Settings → Privacy & security → Camera, including “Let desktop apps access your camera”, then try again.",
  linux: "Check that no other app holds the camera and that your system lets apps use it, then try again.",
};

export function cameraErrorMessage(errorName: string | undefined, platform: CameraPlatform): string {
  switch (errorName) {
    case "NotAllowedError":
    case "SecurityError":
    case "PermissionDenied":
      return `Camera access is not allowed. ${WHERE_TO_ALLOW[platform]}`;
    case "NotFoundError":
    case "OverconstrainedError":
    case "DevicesNotFoundError":
      return "No camera was found.";
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "The camera could not be started. It may be in use by another app.";
    default:
      return "The camera could not be opened.";
  }
}
