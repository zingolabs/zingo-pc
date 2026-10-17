// Runs the production renderer bundle in the unpackaged Electron.
//
//   yarn start:prod                 production bundle, LavaMoat Compartments on
//   yarn start:prod --debug-policy  same, but the LavaMoat runtime lets every
//                                   global access through and logs
//                                   "-- missing <global> from <package>";
//                                   LM_printPolicyDebug() in DevTools prints
//                                   what policy-override.json still lacks
//
// `yarn start` serves the development bundle, which has lockdown but no
// Compartments: @lavamoat/webpack only runs in production builds. The
// unpackaged main process loads http://localhost:3000, so this builds with
// scripts/build.js, serves build/ on that port and launches Electron against
// it. The main process runs as in development (dev CSP, DevTools installer);
// only the renderer is the real thing.
const { spawnSync, spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const buildDir = path.join(root, "build");
const port = 3000;
const debugPolicy = process.argv.includes("--debug-policy");

const env = { ...process.env, ELECTRON_ENABLE_LOGGING: "1" };
// Set by some editors' integrated terminals; it makes Electron run as Node.
delete env.ELECTRON_RUN_AS_NODE;
if (debugPolicy) {
  env.LAVAMOAT_DEBUG_RUNTIME = "1";
}

const build = spawnSync("node", [path.join(__dirname, "build.js")], { cwd: root, env, stdio: "inherit" });
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".map": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  const file = path.join(buildDir, url === "/" ? "index.html" : url);
  if (!file.startsWith(buildDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { "Content-Type": types[path.extname(file)] || "text/javascript" });
  fs.createReadStream(file).pipe(res);
});

server.listen(port, "127.0.0.1", () => {
  console.log(
    `[start-prod] serving build/ on http://localhost:${port}${debugPolicy ? " (LavaMoat debug runtime)" : ""}`,
  );
  const electron = spawn(require("electron"), ["."], { cwd: root, env, stdio: "inherit" });
  electron.on("exit", (code) => {
    server.close();
    process.exit(code ?? 0);
  });
});
