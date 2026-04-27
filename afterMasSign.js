const path = require("path");
const fs = require("fs");
const os = require("os");
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

  const isMas = context.electronPlatformName === "mas" || appOutDir.includes("mas");
  if (!isMas) {
    console.log("[afterMasSign] Not a MAS build, skipping.");
    return;
  }
  console.log("[afterMasSign] MAS build confirmed.");

  // Find the MAS signing identity in keychain.
  const identityResult = spawnSync("security", ["find-identity", "-v", "-p", "codesigning"], { encoding: "utf-8" });
  console.log("[afterMasSign] find-identity stdout:", identityResult.stdout);
  if (identityResult.stderr) {
    console.log("[afterMasSign] find-identity stderr:", identityResult.stderr);
  }

  const identityMatch = identityResult.stdout.match(/"(3rd Party Mac Developer Application:[^"]+)"/);
  if (!identityMatch) {
    throw new Error(
      "[afterMasSign] FATAL: '3rd Party Mac Developer Application' certificate not found.\n" + identityResult.stdout,
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

  // Empty entitlements plist — used to explicitly strip entitlements from
  // non-executable binaries (framework dylibs, native addons). Signing without
  // --entitlements may silently preserve existing ones; an explicit empty plist
  // guarantees they are removed, fixing App Store warning 91166.
  const emptyPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict/></plist>`;
  const emptyEntitlementsPath = path.join(os.tmpdir(), "mas-empty-entitlements.plist");
  fs.writeFileSync(emptyEntitlementsPath, emptyPlist);
  console.log(`[afterMasSign] Empty entitlements plist: ${emptyEntitlementsPath}`);

  const resignNoEntitlements = (filePath) => {
    const rel = path.relative(appPath, filePath);
    console.log(`[afterMasSign] Re-signing (no entitlements): ${rel}`);
    try {
      execSync(
        `codesign --force --sign "${identity}" --entitlements "${emptyEntitlementsPath}" --timestamp "${filePath}"`,
        { stdio: "pipe" },
      );
    } catch (err) {
      const out = err.stdout ? err.stdout.toString() : "";
      const errStr = err.stderr ? err.stderr.toString() : "";
      throw new Error(`[afterMasSign] codesign failed for ${rel}:\n${out}\n${errStr}`);
    }
  };

  // --- 1. Re-sign framework dylibs without entitlements (fixes warning 91166) ---

  const frameworksDir = path.join(appPath, "Contents", "Frameworks");
  const frameworkBundles = [];
  const frameworkBinaries = [];

  if (fs.existsSync(frameworksDir)) {
    for (const entry of fs.readdirSync(frameworksDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.endsWith(".app")) continue;
      if (!entry.name.endsWith(".framework")) continue;
      const fwDir = path.join(frameworksDir, entry.name);
      frameworkBundles.push(fwDir);
      collectBinaries(fwDir, frameworkBinaries);
    }
  }

  console.log(`[afterMasSign] Frameworks: ${frameworkBundles.length}, framework binaries: ${frameworkBinaries.length}`);

  for (const bin of frameworkBinaries) resignNoEntitlements(bin);
  for (const fw of frameworkBundles) resignNoEntitlements(fw);

  // --- 2. Re-sign native addons in app.asar.unpacked (fixes warning 91166) ---
  // electron-builder signs all Mach-O files including native.node with inherit
  // entitlements. These are non-executables and should not have entitlements.

  const asarUnpacked = path.join(appPath, "Contents", "Resources", "app.asar.unpacked");
  if (fs.existsSync(asarUnpacked)) {
    const unpacked = [];
    collectBinaries(asarUnpacked, unpacked);
    console.log(`[afterMasSign] Native addons in asar.unpacked: ${unpacked.length}`);
    for (const bin of unpacked) resignNoEntitlements(bin);
  } else {
    console.log("[afterMasSign] No app.asar.unpacked directory found.");
  }

  // --- 3. Re-seal the main app bundle with explicit MAS entitlements ---
  // Removes auto-added com.apple.security.application-groups that electron-builder
  // injects but was not in the provisioning profile (now it is, but we still want
  // to control exactly what entitlements end up in the final signature).

  const entitlementsPath = path.join(__dirname, "configs", "entitlements.mas.plist");
  console.log("[afterMasSign] Re-sealing app bundle with explicit MAS entitlements...");
  try {
    execSync(`codesign --force --sign "${identity}" --entitlements "${entitlementsPath}" --timestamp "${appPath}"`, {
      stdio: "pipe",
    });
  } catch (err) {
    const out = err.stdout ? err.stdout.toString() : "";
    const errStr = err.stderr ? err.stderr.toString() : "";
    throw new Error(`[afterMasSign] Failed to re-seal app bundle:\n${out}\n${errStr}`);
  }

  console.log("[afterMasSign] Done.");
};
