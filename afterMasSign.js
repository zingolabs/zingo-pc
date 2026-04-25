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
  if (process.platform !== "darwin") return;

  const { appOutDir, packager, targets } = context;

  const isMas =
    Array.isArray(targets) && targets.some((t) => t.name === "mas");
  if (!isMas) return;

  const appName = packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);
  if (!fs.existsSync(appPath)) return;

  // Find the MAS Application signing identity from the keychain.
  const identityResult = spawnSync(
    "security",
    ["find-identity", "-v", "-p", "codesigning"],
    { encoding: "utf-8" }
  );
  const identityMatch = identityResult.stdout.match(
    /"(3rd Party Mac Developer Application:[^"]+)"/
  );
  if (!identityMatch) {
    console.warn("[afterMasSign] MAS Application identity not found, skipping");
    return;
  }
  const identity = identityMatch[1];

  const resign = (filePath, extra = "") => {
    const rel = path.relative(appPath, filePath);
    console.log(`[afterMasSign] Re-signing: ${rel}`);
    execSync(
      `codesign --force --sign "${identity}" --timestamp ${extra} "${filePath}"`
    );
  };

  const frameworksDir = path.join(appPath, "Contents", "Frameworks");
  if (!fs.existsSync(frameworksDir)) return;

  const frameworkBundles = [];
  const binaries = [];

  for (const entry of fs.readdirSync(frameworksDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.endsWith(".app")) continue;
    if (!entry.name.endsWith(".framework")) continue;

    const fwDir = path.join(frameworksDir, entry.name);
    frameworkBundles.push(fwDir);
    collectBinaries(fwDir, binaries);
  }

  // Re-sign binaries inside frameworks (no entitlements).
  for (const bin of binaries) resign(bin);

  // Re-sign framework bundles to update their CodeResources.
  for (const fw of frameworkBundles) resign(fw);

  // Re-seal the main app bundle with MAS entitlements.
  const entitlementsPath = path.join(
    __dirname,
    "configs",
    "entitlements.mas.plist"
  );
  console.log("[afterMasSign] Re-sealing app bundle with MAS entitlements...");
  execSync(
    `codesign --force --sign "${identity}" --entitlements "${entitlementsPath}" --timestamp "${appPath}"`
  );

  console.log("[afterMasSign] Done.");
};
