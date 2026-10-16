// Copies the SES shim from node_modules into public/ so index.html can load it
// as a plain script before the bundle.
//
//   node scripts/stage-ses.js
//
// The shim must reach the renderer exactly as Endo built it: it runs before
// webpack's runtime exists, and neither babel-loader nor Terser should touch
// it. A static file next to index.html gives that; the bundle entry would
// not. The copy is gitignored and refreshed by every start and build, so
// the file always matches the `ses` version the lockfile pins.
const fs = require("fs");
const path = require("path");

const source = path.join(__dirname, "..", "node_modules", "ses", "dist", "ses.umd.min.js");
const target = path.join(__dirname, "..", "public", "ses.umd.min.js");

fs.copyFileSync(source, target);
console.log(`Staged ${path.relative(process.cwd(), target)} from ses ${require("ses/package.json").version}`);
