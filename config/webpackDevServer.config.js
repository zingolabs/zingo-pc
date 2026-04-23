const fs = require("fs");
const evalSourceMapMiddleware = require("react-dev-utils/evalSourceMapMiddleware");
const noopServiceWorkerMiddleware = require("react-dev-utils/noopServiceWorkerMiddleware");
const ignoredFiles = require("react-dev-utils/ignoredFiles");
const redirectServedPath = require("react-dev-utils/redirectServedPathMiddleware");
const paths = require("./paths");
const getHttpsConfig = require("./getHttpsConfig");

const host = process.env.HOST || "0.0.0.0";
const sockHost = process.env.WDS_SOCKET_HOST;
const sockPath = process.env.WDS_SOCKET_PATH;
const sockPort = process.env.WDS_SOCKET_PORT;

function getServerConfig() {
  const httpsConfig = getHttpsConfig();
  if (!httpsConfig) return undefined;
  if (httpsConfig === true) return "https";
  return { type: "https", options: httpsConfig };
}

module.exports = function (proxy, allowedHost) {
  const disableFirewall = !proxy || process.env.DANGEROUSLY_DISABLE_HOST_CHECK === "true";
  const serverConfig = getServerConfig();
  return {
    allowedHosts: disableFirewall ? "all" : [allowedHost],
    compress: true,
    static: {
      directory: paths.appPublic,
      publicPath: [paths.publicUrlOrPath],
      watch: {
        ignored: ignoredFiles(paths.appSrc),
      },
    },
    client: {
      logging: "none",
      overlay: false,
      webSocketURL: {
        hostname: sockHost,
        pathname: sockPath,
        port: sockPort,
      },
    },
    devMiddleware: {
      publicPath: paths.publicUrlOrPath.slice(0, -1),
    },
    ...(serverConfig && { server: serverConfig }),
    host,
    hot: true,
    historyApiFallback: {
      disableDotRule: true,
      index: paths.publicUrlOrPath,
    },
    proxy,
    setupMiddlewares(middlewares, devServer) {
      if (!devServer) {
        throw new Error("webpack-dev-server is not defined");
      }

      if (fs.existsSync(paths.proxySetup)) {
        require(paths.proxySetup)(devServer.app);
      }

      middlewares.unshift({
        name: "evalSourceMapMiddleware",
        middleware: evalSourceMapMiddleware(devServer),
      });

      middlewares.push(
        { name: "redirectServedPath", middleware: redirectServedPath(paths.publicUrlOrPath) },
        { name: "noopServiceWorker", middleware: noopServiceWorkerMiddleware(paths.publicUrlOrPath) },
      );

      return middlewares;
    },
  };
};
