// Stages the Visual C++ runtime DLLs into resources/vcruntime/ so electron-builder
// can place them next to Zingo PC.exe via extraFiles.
//
//   node scripts/stage-vcruntime.js --arch x64        (or arm64)
//
// Why this exists: native.node and nym-proxy.exe are built with MSVC and import
// VCRUNTIME140.dll. Electron itself does not, so on a machine without the Visual
// C++ Redistributable the window opens normally and then every native call fails
// — require() of the module returns "the specified module could not be found".
// Development machines and CI runners have the runtime because Visual Studio
// installs it, so the failure only ever showed up on clean consumer machines. It
// cost two Microsoft Store certification rounds to find.
//
// The api-ms-win-crt-* imports need nothing: those are the Universal CRT, part of
// Windows 10 and later.
//
// Microsoft permits app-local deployment of these DLLs; this is the deployment
// model their own documentation recommends for exactly this case.

const fs = require("fs");
const path = require("path");

// vcruntime140_1.dll only exists on x64 (C++ exception handling) and is absent
// from the arm64 redist; copied when present rather than required.
const WANTED = ["vcruntime140.dll", "vcruntime140_1.dll"];

const argIndex = process.argv.indexOf("--arch");
const arch = argIndex !== -1 ? process.argv[argIndex + 1] : null;
if (!arch || !["x64", "arm64"].includes(arch)) {
  console.error("stage-vcruntime: pass --arch x64 or --arch arm64");
  process.exit(1);
}

// The redist ships with the VS Build Tools / VS installation, under a version
// directory that changes with every toolset update, hence the walk.
function findRedistDirs() {
  const roots = [process.env["ProgramFiles(x86)"], process.env.ProgramFiles]
    .filter(Boolean)
    .map((p) => path.join(p, "Microsoft Visual Studio"));
  const found = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const year of fs.readdirSync(root)) {
      for (const edition of safeReaddir(path.join(root, year))) {
        const base = path.join(root, year, edition, "VC", "Redist", "MSVC");
        for (const version of safeReaddir(base)) {
          const dir = path.join(base, version, arch);
          for (const crt of safeReaddir(dir)) {
            if (/^Microsoft\.VC\d+\.CRT$/i.test(crt)) found.push(path.join(dir, crt));
          }
        }
      }
    }
  }
  // Newest toolset last in readdir order is not guaranteed; sort so it is.
  return found.sort();
}

function safeReaddir(dir) {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

const candidates = findRedistDirs();
if (candidates.length === 0) {
  console.error(
    `stage-vcruntime: no Visual C++ ${arch} redistributable found.\n` +
      `Install the "MSVC v143 - VS 2022 C++ ${arch === "arm64" ? "ARM64/ARM64EC" : "x64/x86"} build tools"\n` +
      `component from the Visual Studio Installer.`,
  );
  process.exit(1);
}
const source = candidates[candidates.length - 1];

const outDir = path.resolve(__dirname, "../resources/vcruntime");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

let copied = 0;
for (const name of WANTED) {
  const from = path.join(source, name);
  if (!fs.existsSync(from)) continue;
  fs.copyFileSync(from, path.join(outDir, name));
  console.log(`stage-vcruntime: ${name} (${arch})`);
  copied++;
}

if (copied === 0) {
  console.error(`stage-vcruntime: found ${source} but none of ${WANTED.join(", ")} were in it.`);
  process.exit(1);
}

console.log(`stage-vcruntime: staged ${copied} file(s) from ${source}`);
