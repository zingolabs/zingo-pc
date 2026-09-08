const path = require("path");
const fs = require("fs");
const os = require("os");
const { execSync, spawnSync } = require("child_process");

const MH_MAGIC = 0xfeedface;
const MH_MAGIC_64 = 0xfeedfacf;
const MH_CIGAM = 0xcefaedfe;
const MH_CIGAM_64 = 0xcffaedfe;
const FAT_MAGIC = 0xcafebabe;
const FAT_MAGIC_64 = 0xcafebabf;
const MH_EXECUTE = 2;

function readU32(fd, offset, littleEndian) {
  const buf = Buffer.alloc(4);
  fs.readSync(fd, buf, 0, 4, offset);
  return littleEndian ? buf.readUInt32LE(0) : buf.readUInt32BE(0);
}

function readU64(fd, offset) {
  const buf = Buffer.alloc(8);
  fs.readSync(fd, buf, 0, 8, offset);
  return Number(buf.readBigUInt64BE(0));
}

// Returns the Mach-O filetype at a header offset, or 0 when no header is there.
function fileTypeAt(fd, offset) {
  const magic = readU32(fd, offset, false);
  if (magic === MH_MAGIC || magic === MH_MAGIC_64) return readU32(fd, offset + 12, false);
  if (magic === MH_CIGAM || magic === MH_CIGAM_64) return readU32(fd, offset + 12, true);
  return 0;
}

// Returns "executable", "code" (dylib, bundle, native addon), or "none",
// reading the first slice of a universal binary for the whole file's kind.
function machOKind(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, "r");
  } catch {
    return "none";
  }
  try {
    const magic = readU32(fd, 0, false);
    let type;
    if (magic === FAT_MAGIC || magic === FAT_MAGIC_64) {
      if (readU32(fd, 4, false) === 0) return "none";
      // fat_arch and fat_arch_64 both carry the slice offset at byte 16, in
      // four bytes and in eight.
      const sliceOffset = magic === FAT_MAGIC_64 ? readU64(fd, 16) : readU32(fd, 16, false);
      type = fileTypeAt(fd, sliceOffset);
    } else {
      type = fileTypeAt(fd, 0);
    }
    if (type === MH_EXECUTE) return "executable";
    return type === 0 ? "none" : "code";
  } catch {
    return "none";
  } finally {
    fs.closeSync(fd);
  }
}

// Recursively collects Mach-O files inside a directory, skipping .app sub-bundles.
function collectBinaries(dir, results) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.endsWith(".app")) collectBinaries(fullPath, results);
    } else if (entry.isFile()) {
      const kind = machOKind(fullPath);
      if (kind !== "none") results.push({ path: fullPath, kind });
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

  const identities = [...identityResult.stdout.matchAll(/"(3rd Party Mac Developer Application:[^"]+)"/g)].map(
    (m) => m[1],
  );
  if (identities.length === 0) {
    throw new Error(
      "[afterMasSign] FATAL: '3rd Party Mac Developer Application' certificate not found.\n" + identityResult.stdout,
    );
  }

  // electron-builder signed with CSC_NAME, and this pass re-signs what it
  // produced, so a keychain holding two team certificates has to pick the same
  // one rather than whichever came first.
  const wanted = process.env.CSC_NAME;
  const identity = wanted ? identities.find((name) => name.includes(wanted)) : identities[0];
  if (!identity) {
    throw new Error(`[afterMasSign] FATAL: no certificate matches CSC_NAME "${wanted}".\n${identities.join("\n")}`);
  }
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

  // Executables the app launches are a different case. MAS requires every one
  // of them to carry app-sandbox + inherit so it runs inside the parent's
  // sandbox, so they get the inherit plist while the dylibs get the empty one.
  const inheritEntitlementsPath = path.join(__dirname, "configs", "entitlements.mas.inherit.plist");

  const resign = (filePath, entitlementsPath, label) => {
    const rel = path.relative(appPath, filePath);
    console.log(`[afterMasSign] Re-signing (${label}): ${rel}`);
    try {
      execSync(`codesign --force --sign "${identity}" --entitlements "${entitlementsPath}" --timestamp "${filePath}"`, {
        stdio: "pipe",
      });
    } catch (err) {
      const out = err.stdout ? err.stdout.toString() : "";
      const errStr = err.stderr ? err.stderr.toString() : "";
      throw new Error(`[afterMasSign] codesign failed for ${rel}:\n${out}\n${errStr}`);
    }
  };

  const resignByKind = ({ path: filePath, kind }) =>
    kind === "executable"
      ? resign(filePath, inheritEntitlementsPath, "inherit")
      : resign(filePath, emptyEntitlementsPath, "no entitlements");

  // --- 1. Re-sign the framework contents (fixes warning 91166) ---
  // Dylibs lose their entitlements. The executables Electron ships inside its
  // framework, chrome_crashpad_handler and Squirrel's ShipIt, keep inherit.

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

  for (const bin of frameworkBinaries) resignByKind(bin);
  for (const fw of frameworkBundles) resign(fw, emptyEntitlementsPath, "no entitlements");

  // --- 2. Re-sign native addons in app.asar.unpacked (fixes warning 91166) ---
  // electron-builder signs all Mach-O files including native.node with inherit
  // entitlements. These are non-executables and should not have entitlements.

  const asarUnpacked = path.join(appPath, "Contents", "Resources", "app.asar.unpacked");
  if (fs.existsSync(asarUnpacked)) {
    const unpacked = [];
    collectBinaries(asarUnpacked, unpacked);
    console.log(`[afterMasSign] Native addons in asar.unpacked: ${unpacked.length}`);
    for (const bin of unpacked) resignByKind(bin);
  } else {
    console.log("[afterMasSign] No app.asar.unpacked directory found.");
  }

  // --- 2.5. Sign the bundled nym-proxy with inherit entitlements ---
  // The wallet spawns it as a child (ADR 0024). It lives in Contents/MacOS
  // (extraFiles), untouched by the passes above.

  const nymProxyPath = path.join(appPath, "Contents", "MacOS", "nym-proxy");
  if (fs.existsSync(nymProxyPath)) {
    resign(nymProxyPath, inheritEntitlementsPath, "inherit");
  } else {
    console.log("[afterMasSign] No bundled nym-proxy in Resources (non-mixnet build?).");
  }

  // --- 3. Re-seal the main app bundle with explicit MAS entitlements ---
  // Removes auto-added com.apple.security.application-groups that electron-builder
  // injects but was not in the provisioning profile (now it is, but we still want
  // to control exactly what entitlements end up in the final signature).

  const appEntitlementsPath = path.join(__dirname, "configs", "entitlements.mas.plist");
  resign(appPath, appEntitlementsPath, "app bundle");

  console.log("[afterMasSign] Done.");
};
