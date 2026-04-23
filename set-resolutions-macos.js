const fs = require("fs");
const { execSync } = require("child_process");
const os = require("os");

if (os.platform() === "darwin") {
  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

  if (!packageJson.resolutions || !packageJson.resolutions.fsevents) {
    const hadResolutions = !!packageJson.resolutions;
    if (!packageJson.resolutions) packageJson.resolutions = {};
    packageJson.resolutions.fsevents = "2.3.2";

    fs.writeFileSync("package.json", JSON.stringify(packageJson, null, 2));
    console.log("Adding fsevents resolution for macOS, re-running yarn...");
    execSync("yarn install", { stdio: "inherit" });

    // Remove the temporary fsevents resolution, restore previous state
    delete packageJson.resolutions.fsevents;
    if (!hadResolutions) delete packageJson.resolutions;
    fs.writeFileSync("package.json", JSON.stringify(packageJson, null, 2));
  } else {
    console.log("fsevents resolution already present, skipping.");
  }
} else {
  console.log("Not macOS, skipping fsevents resolution.");
}
