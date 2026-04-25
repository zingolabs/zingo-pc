const path = require("path");
const fs = require("fs");
const { execSync, spawnSync } = require("child_process");

// Returns true if the file is a Mach-O binary (checks magic bytes).
function isMachO(filePath) {
  try {
    const buf = Buffer.alloc(4);
    const fd = fs.openSync(filePath, "r");
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    const magic = buf.readUInt32BE(0);
    // 64-bit, 32-bit, or fat binary
    return magic === 0xfeedfacf || magic === 0xfeedface || magic === 0xcafebabe;
  } catch {
    return false;
  }
}

// Recursively collects Mach-O binaries inside a directory, skipping .app sub-bundles.
function collectBinaries(dir, results) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.endsWith(".app")) collectBinaries(fullPath, results);
    } else if (entry.isFile() && isMachO(fullPath)) {
      results.push(fullPath);
    }
  }
}

module.exports = async function afterSign(context) {
  console.log("[afterMasSign] Hook invoked.");
  console.log(`[afterMasSign] process.platform=${process.platform}`);

  if (process.platform !== "darwin") {
    console.log("[afterMasSign] Not darwin, skipping.");
    return;
  }

  const { appOutDir, packager } = context;
  console.log(`[afterMasSign] appOutDir=${appOutDir}`);
  console.log(`[afterMasSign] electronPlatformName=${context.electronPlatformName}`);

  // Detect MAS build: electron-builder outputs MAS to dist/mas or dist/mas-universal,
  // and sets electronPlatformName to "mas". Both checks for reliability.
  const isMas =
    context.electronPlatformName === "mas" || appOutDir.includes("mas");
  if (!isMas) {
    console.log("[afterMasSign] Not a MAS build, skipping.");
    return;
  }
  console.log("[afterMasSign] MAS build confirmed.");

  // Find the MAS signing identity in keychain.
  const identityResult = spawnSync(
    "security",
    ["find-identity", "-v", "-p", "codesigning"],
    { encoding: "utf-8" }
  );
  console.log("[afterMasSign] find-identity stdout:", identityResult.stdout);
  if (identityResult.stderr) {
    console.log("[afterMasSign] find-identity stderr:", identityResult.stderr);
  }

  const identityMatch = identityResult.stdout.match(
    /"(3rd Party Mac Developer Application:[^"]+)"/
  );
  if (!identityMatch) {
    throw new Error(
      "[afterMasSign] FATAL: '3rd Party Mac Developer Application' certificate not found in keychain. " +
        "Cannot re-sign MAS build. Identities found:\n" +
        identityResult.stdout
    );
  }
  const identity = identityMatch[1];
  console.log(`[afterMasSign] Signing identity: ${identity}`);

  const appName = packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);
  if (!fs.existsSync(appPath)) {
    throw new Error(`[afterMasSign] FATAL: App bundle not found at ${appPath}`);
  }
  console.log(`[afterMasSign] App bundle: ${appPath}`);

  const resign = (filePath, extra = "") => {
    const rel = path.relative(appPath, filePath);
    console.log(`[afterMasSign] Re-signing: ${rel}`);
    try {
      execSync(
        `codesign --force --sign "${identity}" --timestamp ${extra} "${filePath}"`,
        { stdio: "pipe" }
      );
    } catch (err) {
      const out = err.stdout ? err.stdout.toString() : "";
      const errStr = err.stderr ? err.stderr.toString() : "";
      throw new Error(
        `[afterMasSign] codesign failed for ${rel}:\n${out}\n${errStr}`
      );
    }
  };

  const frameworksDir = path.join(appPath, "Contents", "Frameworks");
  if (!fs.existsSync(frameworksDir)) {
    console.log("[afterMasSign] No Frameworks directory, nothing to re-sign.");
    return;
  }

  const frameworkBundles = [];
  const binaries = [];

  for (const entry of fs.readdirSync(frameworksDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.endsWith(".app")) continue;
    if (!entry.name.endsWith(".framework")) continue;

    const fwDir = path.join(frameworksDir, entry.name);
    frameworkBundles.push(fwDir);
    collectBinaries(fwDir, binaries);
  }

  console.log(
    `[afterMasSign] Found ${frameworkBundles.length} framework(s), ${binaries.length} binary(ies) to re-sign.`
  );

  // Re-sign binaries inside frameworks without entitlements (fixes warning 91166).
  for (const bin of binaries) resign(bin);

  // Re-sign framework bundles to update their CodeResources.
  for (const fw of frameworkBundles) resign(fw);

  // Re-seal the main app bundle with explicit MAS entitlements.
  // This removes the com.apple.security.application-groups that electron-builder
  // auto-adds but that is not in the provisioning profile, which causes taskgated
  // to disallow IPC and produces a blue/white screen at launch.
  const entitlementsPath = path.join(
    __dirname,
    "configs",
    "entitlements.mas.plist"
  );
  console.log(
    "[afterMasSign] Re-sealing app bundle with explicit MAS entitlements..."
  );
  try {
    execSync(
      `codesign --force --sign "${identity}" --entitlements "${entitlementsPath}" --timestamp "${appPath}"`,
      { stdio: "pipe" }
    );
  } catch (err) {
    const out = err.stdout ? err.stdout.toString() : "";
    const errStr = err.stderr ? err.stderr.toString() : "";
    throw new Error(
      `[afterMasSign] Failed to re-seal app bundle:\n${out}\n${errStr}`
    );
  }

  console.log("[afterMasSign] Done.");
};
