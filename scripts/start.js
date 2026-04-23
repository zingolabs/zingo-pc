process.env.BABEL_ENV = "development";
process.env.NODE_ENV = "development";

process.on("unhandledRejection", (err) => {
  throw err;
});

require("../config/env");

const fs = require("fs");
const net = require("net");
const chalk = require("chalk");
const webpack = require("webpack");
const WebpackDevServer = require("webpack-dev-server");
const semver = require("semver");
const paths = require("../config/paths");
const configFactory = require("../config/webpack.config");
const createDevServerConfig = require("../config/webpackDevServer.config");
const react = require(require.resolve("react", { paths: [paths.appPath] }));

const DEFAULT_PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || "0.0.0.0";

// Check that entry files exist
[paths.appHtml, paths.appIndexJs].forEach((filePath) => {
  if (!fs.existsSync(filePath)) {
    console.error(chalk.red(`Could not find a required file: ${filePath}`));
    process.exit(1);
  }
});

// Find an available port starting from the requested one
function findPort(host, port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(port, host);
    server.on("listening", () => server.close(() => resolve(port)));
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.log(chalk.yellow(`Port ${port} is already in use, trying ${port + 1}...`));
        resolve(findPort(host, port + 1));
      } else {
        reject(err);
      }
    });
  });
}

findPort(HOST, DEFAULT_PORT)
  .then((port) => {
    const config = configFactory("development");
    const protocol = process.env.HTTPS === "true" ? "https" : "http";
    const localUrl = `${protocol}://localhost:${port}`;

    const compiler = webpack(config);

    compiler.hooks.done.tap("start", (stats) => {
      const json = stats.toJson({ all: false, warnings: true, errors: true });
      process.stdout.write("\x1Bc"); // clear console
      if (json.errors && json.errors.length) {
        console.log(chalk.red("Failed to compile.\n"));
        json.errors.forEach((e) => console.log((e.message || e) + "\n"));
      } else if (json.warnings && json.warnings.length) {
        console.log(chalk.yellow("Compiled with warnings.\n"));
        json.warnings.forEach((w) => console.log((w.message || w) + "\n"));
        console.log(`\nApp running at: ${chalk.cyan(localUrl)}\n`);
      } else {
        console.log(chalk.green("Compiled successfully!\n"));
        console.log(`App running at: ${chalk.cyan(localUrl)}\n`);
      }

      if (semver.lt(react.version, "16.10.0") && process.env.FAST_REFRESH) {
        console.log(chalk.yellow(`Fast Refresh requires React 16.10+. You are using ${react.version}.`));
      }
    });

    const proxySetting = require(paths.appPackageJson).proxy;
    const serverConfig = {
      ...createDevServerConfig(proxySetting, "localhost"),
      host: HOST,
      port,
    };

    const devServer = new WebpackDevServer(serverConfig, compiler);

    devServer.startCallback(() => {
      console.log(chalk.cyan("Starting the development server...\n"));

      // Respect BROWSER=none (set by the Electron start script)
      if (process.env.BROWSER !== "none") {
        try {
          require("open")(localUrl);
        } catch (_) {}
      }
    });

    ["SIGINT", "SIGTERM"].forEach((sig) => {
      process.on(sig, () => {
        devServer.stop();
        process.exit();
      });
    });

    if (process.env.CI !== "true") {
      process.stdin.on("end", () => {
        devServer.stop();
        process.exit();
      });
    }
  })
  .catch((err) => {
    if (err && err.message) console.log(err.message);
    process.exit(1);
  });
