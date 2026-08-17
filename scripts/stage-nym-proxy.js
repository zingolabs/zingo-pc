// Builds the nym-proxy binary and stages it into resources/ for
// electron-builder extraResources.
//
// The source lives in zingolib (zingo-netutils, a separate cargo workspace
// whose own lockfile resolves the nym-sdk conflict), so this reaches across
// repos. Rather than depend on a checkout someone happens to have beside this
// one, the script fetches zingolib itself, at exactly the revision
// native/Cargo.lock already resolved to. That lockfile is the single source of
// truth for which zingolib this app is built against, and it is what the neon
// addon compiles from, so pinning the proxy to it is what keeps the tunnel and
// the wallet core the same zingolib. CI and a laptop run the identical steps
// and get the identical binary.
//
// ZINGOLIB_PATH still points the build at a working copy, for developing
// nym-proxy itself. That is a deliberate opt-out of the pinning, so it warns,
// and under --strict-rev (the dist:* scripts) it refuses outright.
//
// Universal by default (x86_64 + aarch64 lipo'd, matching the native.node
// dist:mac-mas flow); pass a single --target to build just one arch, or --host
// to build for the machine running this.
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const strictRev = process.argv.includes("--strict-rev");
const repoRoot = path.resolve(__dirname, "..");
// Managed checkout, gitignored. Kept across runs so cargo's target/ stays warm;
// --clean is what forces a cold rebuild.
const managedDir = path.join(repoRoot, ".zingolib-src");

const git = (args, cwd) =>
  execSync(`git ${args}`, { cwd, stdio: ["ignore", "pipe", "pipe"] })
    .toString()
    .trim();

// The git source Cargo resolved zingolib to: repository URL and exact commit.
function pinnedSource() {
  const lock = path.join(repoRoot, "native/Cargo.lock");
  if (!fs.existsSync(lock)) return null;
  const lines = fs.readFileSync(lock, "utf8").split("\n");
  const nameAt = lines.findIndex((l) => l.trim() === 'name = "zingolib"');
  if (nameAt === -1) return null;
  const source = lines.slice(nameAt, nameAt + 6).find((l) => l.trim().startsWith("source ="));
  // source = "git+https://github.com/zingolabs/zingolib?branch=dev#<40-hex>"
  const match = source && source.match(/"git\+([^?#"]+)[^#"]*#([0-9a-f]{40})"/);
  return match ? { url: match[1], rev: match[2] } : null;
}

// Fetch just the pinned commit into the managed checkout. Shallow and by exact
// SHA, so this costs one commit's worth of transfer rather than the history.
// Already on that commit means there is nothing to do, which is the common case
// and leaves the cargo cache untouched.
function ensureManagedCheckout({ url, rev }) {
  if (fs.existsSync(path.join(managedDir, ".git"))) {
    try {
      if (git("rev-parse HEAD", managedDir) === rev) {
        console.log(`stage-nym-proxy: zingolib already at ${rev.slice(0, 12)}`);
        return managedDir;
      }
    } catch {
      /* unreadable checkout; the fetch below repairs it */
    }
  } else {
    fs.mkdirSync(managedDir, { recursive: true });
    git("init -q", managedDir);
    git(`remote add origin ${url}`, managedDir);
  }
  git(`remote set-url origin ${url}`, managedDir);

  console.log(`stage-nym-proxy: fetching zingolib ${rev.slice(0, 12)} from ${url}`);
  try {
    git(`fetch --depth 1 origin ${rev}`, managedDir);
  } catch (e) {
    console.error(
      `stage-nym-proxy: could not fetch ${rev} from ${url}. ` +
        `The commit native/Cargo.lock pins may have been force-pushed away, or the network is down.\n` +
        (e.stderr ? e.stderr.toString().trim() : e.message),
    );
    process.exit(1);
  }
  git("checkout -q -f --detach FETCH_HEAD", managedDir);

  const head = git("rev-parse HEAD", managedDir);
  if (head !== rev) {
    console.error(`stage-nym-proxy: checkout landed on ${head}, expected ${rev}.`);
    process.exit(1);
  }
  return managedDir;
}

// A working copy named by ZINGOLIB_PATH is whatever the developer left it on,
// which is the point of the override — but say so, and never ship it.
function useOverride(dir, pinned) {
  let head = null;
  try {
    head = git("rev-parse HEAD", dir);
  } catch {
    /* not a git checkout; nothing to compare against */
  }
  if (pinned && head && head !== pinned.rev) {
    let where = "";
    try {
      const branch = git("branch --show-current", dir);
      if (branch) where = ` (branch ${branch})`;
    } catch {
      /* detached HEAD; the rev alone is enough */
    }
    const message =
      `ZINGOLIB_PATH=${dir} is at ${head.slice(0, 12)}${where}, but native/Cargo.lock pins zingolib to ` +
      `${pinned.rev.slice(0, 12)}. The nym-proxy this builds will not match the zingolib the native addon ` +
      `compiles against. Unset ZINGOLIB_PATH to build from the pinned revision.`;
    if (strictRev) {
      console.error(`stage-nym-proxy: ${message}`);
      process.exit(1);
    }
    console.warn(`stage-nym-proxy: WARNING — ${message}`);
  }
  return dir;
}

const pinned = pinnedSource();
let zingolib;
if (process.env.ZINGOLIB_PATH) {
  zingolib = useOverride(path.resolve(process.env.ZINGOLIB_PATH), pinned);
} else if (pinned) {
  zingolib = ensureManagedCheckout(pinned);
} else {
  console.error(
    "stage-nym-proxy: could not read the zingolib git revision from native/Cargo.lock. " +
      "Set ZINGOLIB_PATH to a zingolib checkout to build against it directly.",
  );
  process.exit(1);
}

const manifest = path.join(zingolib, "zingo-netutils/Cargo.toml");
if (!fs.existsSync(manifest)) {
  console.error(`stage-nym-proxy: no zingo-netutils workspace at ${zingolib} (looked for ${manifest}).`);
  process.exit(1);
}

// The Rust triple for the machine running this script, for `--host`. The dist:*
// scripts always name their --target, so the no-flag default stays the macOS
// universal pair that dist:mac-mas relies on.
function hostTarget() {
  const arch = { x64: "x86_64", arm64: "aarch64" }[process.arch];
  const os = { win32: "pc-windows-msvc", darwin: "apple-darwin", linux: "unknown-linux-gnu" }[process.platform];
  if (!arch || !os) {
    console.error(
      `stage-nym-proxy: no known Rust triple for ${process.platform}/${process.arch}. Pass --target explicitly.`,
    );
    process.exit(1);
  }
  return `${arch}-${os}`;
}

const flagTarget = process.argv.indexOf("--target");
const targets =
  flagTarget !== -1
    ? [process.argv[flagTarget + 1]]
    : process.argv.includes("--host")
      ? [hostTarget()]
      : ["x86_64-apple-darwin", "aarch64-apple-darwin"];

const isWindows = targets.some((t) => t.includes("windows"));
const binName = isWindows ? "nym-proxy.exe" : "nym-proxy";

const outDir = path.join(repoRoot, "resources");
const out = path.join(outDir, binName);

// `--clean`, for release builds: wipe zingo-netutils' target so the binary is
// compiled here and now rather than reused. Also drop whatever is already
// staged, both the name we are about to write and the other platform's, so a
// build that dies partway leaves no earlier binary behind for electron-builder
// to pick up as if it were this run's.
if (process.argv.includes("--clean")) {
  console.log("stage-nym-proxy: cleaning zingo-netutils target and staged binaries");
  execSync(`cargo clean --manifest-path "${manifest}"`, { stdio: "inherit" });
  for (const stale of ["nym-proxy", "nym-proxy.exe"]) {
    fs.rmSync(path.join(outDir, stale), { force: true });
  }
}

const built = targets.map((target) => {
  console.log(`stage-nym-proxy: building nym-proxy for ${target}`);
  execSync(`cargo build --release --bin nym-proxy --features nym --target ${target} --manifest-path "${manifest}"`, {
    stdio: "inherit",
  });
  return path.join(zingolib, "zingo-netutils/target", target, "release", binName);
});

fs.mkdirSync(outDir, { recursive: true });

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
