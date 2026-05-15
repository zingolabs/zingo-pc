#!/usr/bin/env node
// Bumps version + build across all release-related files in one shot.
// Usage: node bin/prep-release.js <X.Y.Z> <BUILD>
// Example: node bin/prep-release.js 2.0.15 142

const fs = require("fs");
const path = require("path");

const [, , version, build] = process.argv;

if (!version || !build || !/^\d+\.\d+\.\d+$/.test(version) || !/^\d+$/.test(build)) {
  console.error("Usage: node bin/prep-release.js <X.Y.Z> <BUILD>");
  console.error("Example: node bin/prep-release.js 2.0.15 142");
  process.exit(1);
}

const root = path.resolve(__dirname, "..");
const today = new Date().toISOString().slice(0, 10);

// 1. package.json — version + bundleVersion(mac, mas)
{
  const pkgPath = path.join(root, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  pkg.version = version;
  if (pkg.build?.mac) pkg.build.mac.bundleVersion = build;
  if (pkg.build?.mas) pkg.build.mas.bundleVersion = build;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`  package.json         -> version=${version} bundleVersion=${build}`);
}

// 2. src/version.ts
{
  const p = path.join(root, "src", "version.ts");
  fs.writeFileSync(p, `const APP_VERSION = "${version} (${build})";\n\nexport default APP_VERSION;\n`);
  console.log(`  src/version.ts       -> "${version} (${build})"`);
}

// 3. bin/printversion.sh
{
  const p = path.join(root, "bin", "printversion.sh");
  fs.writeFileSync(p, `#!/bin/bash\nVERSION="${version}-${build}"\necho "VERSION=$VERSION" >> $GITHUB_ENV\n`);
  console.log(`  bin/printversion.sh  -> ${version}-${build}`);
}

// 4. bin/printversion.ps1
{
  const p = path.join(root, "bin", "printversion.ps1");
  fs.writeFileSync(
    p,
    `echo "VERSION=${version}-${build}" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append\n`,
  );
  console.log(`  bin/printversion.ps1 -> ${version}-${build}`);
}

// 5. flatpak/co.zingo.pc.metainfo.xml — refresh date or insert new entry
{
  const p = path.join(root, "flatpak", "co.zingo.pc.metainfo.xml");
  let xml = fs.readFileSync(p, "utf8");
  const escaped = version.replace(/\./g, "\\.");
  const existingRe = new RegExp(`(release version="${escaped}" date=")[^"]*(")`);
  if (existingRe.test(xml)) {
    xml = xml.replace(existingRe, `$1${today}$2`);
    console.log(`  flatpak metainfo     -> updated date for ${version} (${today})`);
  } else {
    // Insert as a self-closing entry at the top of <releases>.
    // Add a description block manually after running this if you want release notes.
    xml = xml.replace(/(<releases>\n)/, `$1    <release version="${version}" date="${today}"/>\n`);
    console.log(`  flatpak metainfo     -> inserted new release ${version} (${today})`);
  }
  fs.writeFileSync(p, xml);
}

console.log(`\nReady. Suggested next steps:`);
console.log(`  git diff`);
console.log(`  git add -A`);
console.log(`  git commit -m "fix: new release ${version} (${build})"`);
console.log(`  git push`);
console.log(`  git tag -m "release ${version} (${build})" zingo-pc-${version}-${build}`);
console.log(`  git push origin zingo-pc-${version}-${build}`);
