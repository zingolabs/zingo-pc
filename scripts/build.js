process.env.BABEL_ENV = "production";
process.env.NODE_ENV = "production";

process.on("unhandledRejection", (err) => {
  throw err;
});

require("../config/env");

const path = require("path");
const fs = require("fs-extra");
const zlib = require("zlib");
const chalk = require("chalk");
const webpack = require("webpack");
const configFactory = require("../config/webpack.config");
const paths = require("../config/paths");

// Check that entry files exist
[paths.appHtml, paths.appIndexJs].forEach((filePath) => {
  if (!fs.existsSync(filePath)) {
    console.error(chalk.red(`Could not find a required file: ${filePath}`));
    process.exit(1);
  }
});

const argv = process.argv.slice(2);
const writeStatsJson = argv.indexOf("--stats") !== -1;

const config = configFactory("production");

build()
  .then(({ stats, warnings }) => {
    if (warnings.length) {
      console.log(chalk.yellow("Compiled with warnings.\n"));
      warnings.forEach((w) => console.log(w + "\n"));
    } else {
      console.log(chalk.green("Compiled successfully.\n"));
    }
    copyNativeNode();
    printFileSizes(paths.appBuild);

    if (writeStatsJson) {
      const bfj = require("bfj");
      return bfj.write(paths.appBuild + "/bundle-stats.json", stats.toJson());
    }
  })
  .catch((err) => {
    console.log(chalk.red("Failed to compile.\n"));
    console.log((err.message || err) + "\n");
    process.exit(1);
  });

function build() {
  console.log("Creating an optimized production build...");

  fs.emptyDirSync(paths.appBuild);
  copyPublicFolder();

  const compiler = webpack(config);
  return new Promise((resolve, reject) => {
    compiler.run((err, stats) => {
      compiler.close(() => {});

      if (err) {
        return reject(err.message ? err : new Error(String(err)));
      }

      const json = stats.toJson({ all: false, warnings: true, errors: true });
      const errors = (json.errors || []).map((e) => e.message || String(e));
      const warnings = (json.warnings || []).map((w) => w.message || String(w));

      if (errors.length) {
        return reject(new Error(errors[0]));
      }

      if (process.env.CI && warnings.length) {
        console.log(chalk.yellow("Treating warnings as errors because CI=true.\n"));
        return reject(new Error(warnings.join("\n\n")));
      }

      resolve({ stats, warnings });
    });
  });
}

function copyPublicFolder() {
  fs.copySync(paths.appPublic, paths.appBuild, {
    dereference: true,
    filter: (file) => file !== paths.appHtml,
  });
}

function copyNativeNode() {
  const src = path.join(__dirname, "../src/native.node");
  const dest = path.join(paths.appBuild, "native.node");
  // Missing means the neon step did not produce a module, and a build without it
  // is not a build: it packages, installs and launches, then fails on the first
  // wallet call with an error that points nowhere near this. This used to be a
  // yellow warning in the middle of a few hundred lines of webpack output.
  if (!fs.existsSync(src)) {
    throw new Error(
      `src/native.node not found. The native module was not built — run "yarn neon-win-<arch>" ` +
        `(or the matching neon script for this platform) before building.`,
    );
  }
  fs.copySync(src, dest);
  console.log(chalk.cyan("Copied native.node to build/"));
}

function gzipSize(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    return zlib.gzipSync(buf, { level: 9 }).length;
  } catch (_) {
    return 0;
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function printFileSizes(buildFolder) {
  console.log("File sizes after gzip:\n");

  function walk(dir) {
    const entries = fs.readdirSync(dir);
    entries.forEach((entry) => {
      const full = path.join(dir, entry);
      if (fs.statSync(full).isDirectory()) {
        walk(full);
      } else if (/\.(js|css)$/.test(entry)) {
        const size = gzipSize(full);
        const rel = path.relative(buildFolder, full);
        const sizeStr = formatSize(size);
        const WARN_SIZE = 512 * 1024;
        const color = size > WARN_SIZE ? chalk.yellow : chalk.green;
        console.log(`  ${color(sizeStr.padStart(10))}  ${chalk.dim(rel)}`);
      }
    });
  }

  walk(buildFolder);
  console.log();
}
