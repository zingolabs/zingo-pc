// Builds the macOS nym-proxy binary and stages it into resources/ for
// electron-builder extraResources. The binary source lives in zingolib
// (zingo-netutils, a separate cargo workspace whose own lockfile resolves the
// nym-sdk conflict), so this reaches across repos. ZINGOLIB_PATH overrides its
// location; the default assumes zingolib sits beside zingo-pc.
//
// Universal by default (x86_64 + aarch64 lipo'd, matching the native.node
// dist:mac-mas flow); pass a single --target to build just one arch.
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const zingolib = process.env.ZINGOLIB_PATH || path.resolve(__dirname, "../../zingolib");
const manifest = path.join(zingolib, "zingo-netutils/Cargo.toml");
if (!fs.existsSync(manifest)) {
  console.error(
    `stage-nym-proxy: zingolib not found at ${zingolib}. Set ZINGOLIB_PATH to your zingolib checkout (looked for ${manifest}).`,
  );
  process.exit(1);
}

const flagTarget = process.argv.indexOf("--target");
const targets = flagTarget !== -1 ? [process.argv[flagTarget + 1]] : ["x86_64-apple-darwin", "aarch64-apple-darwin"];

const isWindows = targets.some((t) => t.includes("windows"));
const binName = isWindows ? "nym-proxy.exe" : "nym-proxy";

const built = targets.map((target) => {
  console.log(`stage-nym-proxy: building nym-proxy for ${target}`);
  execSync(`cargo build --release --bin nym-proxy --features nym --target ${target} --manifest-path "${manifest}"`, {
    stdio: "inherit",
  });
  return path.join(zingolib, "zingo-netutils/target", target, "release", binName);
});

const outDir = path.resolve(__dirname, "../resources");
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, binName);

if (built.length === 1) {
  fs.copyFileSync(built[0], out);
} else {
  // lipo is macOS-only; the multi-target path is exclusively the mac universal build.
  execSync(`lipo -create -output "${out}" ${built.map((b) => `"${b}"`).join(" ")}`, {
    stdio: "inherit",
  });
}
if (!isWindows) fs.chmodSync(out, 0o755);
console.log(`stage-nym-proxy: staged ${targets.join(" + ")} at ${out}`);
