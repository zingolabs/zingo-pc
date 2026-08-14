// Verifies the architecture-specific files match the target before packaging.
//
//   node scripts/check-win-arch.js --arch x64        (or arm64)
//
// build/native.node, src/native.node and resources/nym-proxy.exe are shared
// paths rewritten by `yarn build-win-<arch>` and stage-nym-proxy. Nothing about
// them records which architecture they hold, so any electron-builder run that
// does not regenerate them packages whatever the previous build left behind.
//
// That is not hypothetical: an x64 package once shipped with an arm64
// native.node after an arm64 build in the same tree. It installed, launched, and
// then failed on every native call, because require() of a wrong-architecture
// module throws and the failure surfaced far from its cause. CI never sees this
// (each job gets a clean runner); local builds — the ones uploaded to the Store —
// are wide open to it.

const fs = require("fs");
const path = require("path");

const { peArch, ARCHITECTURES } = require("./pe-arch");

const argIndex = process.argv.indexOf("--arch");
const expected = argIndex !== -1 ? process.argv[argIndex + 1] : null;
if (!expected || !ARCHITECTURES.includes(expected)) {
  console.error("check-win-arch: pass --arch x64 or --arch arm64");
  process.exit(1);
}

const root = path.resolve(__dirname, "..");
const required = [
  path.join(root, "src", "native.node"),
  path.join(root, "build", "native.node"),
  path.join(root, "resources", "nym-proxy.exe"),
];
// Staged by stage-vcruntime.js; also architecture-specific, and shipping the
// wrong one would fail the same way it would with no runtime at all.
const vcDir = path.join(root, "resources", "vcruntime");
const optional = fs.existsSync(vcDir)
  ? fs
      .readdirSync(vcDir)
      .filter((f) => f.endsWith(".dll"))
      .map((f) => path.join(vcDir, f))
  : [];

const problems = [];
for (const file of [...required, ...optional]) {
  const name = path.relative(root, file);
  if (!fs.existsSync(file)) {
    problems.push(`${name}: missing`);
    continue;
  }
  const actual = peArch(file);
  console.log(`  ${actual.padEnd(8)} ${name}`);
  if (actual !== expected) {
    problems.push(`${name}: ${actual}, expected ${expected}`);
  }
}

if (problems.length > 0) {
  console.error(`\ncheck-win-arch: architecture mismatch for a ${expected} build:\n`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    `\nA package built now would install and then fail on every native call.\n` +
      `Run "yarn dist:win-${expected}" (or dist:win-msix-${expected}) from the top, so the\n` +
      `native module and nym-proxy are rebuilt for ${expected} rather than reused.\n`,
  );
  process.exit(1);
}

console.log(`check-win-arch: all ${expected}.`);
