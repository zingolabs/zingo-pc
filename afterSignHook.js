const fs = require("fs");
const electron_notarize = require("@electron/notarize");

module.exports = async function (params) {
  if (process.platform !== "darwin") {
    return;
  }

  const appId = "co.zingo.pc";
  const appPath = params.artifactPaths.find((p) => p.endsWith(".dmg"));

  // MAS builds produce .pkg, not .dmg — notarization is handled by App Store
  if (!appPath || !fs.existsSync(appPath)) {
    return;
  }

  console.log(`Notarizing ${appId} found at ${appPath}`);

  try {
    await electron_notarize.notarize({
      appBundleId: appId,
      appPath,
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID,
    });
  } catch (error) {
    console.error(error);
    return;
  }

  console.log(`Done notarizing ${appId}`);
};
