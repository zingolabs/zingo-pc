const path = require("path");
const fs = require("fs");
const appDirectory = fs.realpathSync(process.cwd());
const resolveApp = (relativePath) => path.resolve(appDirectory, relativePath);

// Inlined from react-dev-utils/getPublicUrlOrPath.
// Determines the public URL prefix from PUBLIC_URL env var or package.json "homepage".
// Relative paths (starting with ".") are converted to "/" in development.
function getPublicUrlOrPath(isEnvDevelopment, homepage, envPublicUrl) {
  const stub = "https://create-react-app.dev";
  if (envPublicUrl) {
    const url = envPublicUrl.endsWith("/") ? envPublicUrl : envPublicUrl + "/";
    return isEnvDevelopment && url.startsWith(".") ? "/" : isEnvDevelopment ? new URL(url, stub).pathname : url;
  }
  if (homepage) {
    const hp = homepage.endsWith("/") ? homepage : homepage + "/";
    return isEnvDevelopment && hp.startsWith(".") ? "/" : isEnvDevelopment ? new URL(hp, stub).pathname : hp;
  }
  return "/";
}

const publicUrlOrPath = getPublicUrlOrPath(
  process.env.NODE_ENV === "development",
  require(resolveApp("package.json")).homepage,
  process.env.PUBLIC_URL,
);

const buildPath = process.env.BUILD_PATH || "build";

const moduleFileExtensions = [
  "web.mjs",
  "mjs",
  "web.js",
  "js",
  "web.ts",
  "ts",
  "web.tsx",
  "tsx",
  "json",
  "web.jsx",
  "jsx",
];

// Resolve file paths in the same order as webpack
const resolveModule = (resolveFn, filePath) => {
  const extension = moduleFileExtensions.find((extension) => fs.existsSync(resolveFn(`${filePath}.${extension}`)));

  if (extension) {
    return resolveFn(`${filePath}.${extension}`);
  }

  return resolveFn(`${filePath}.js`);
};

// config after eject: we're in ./config/
module.exports = {
  dotenv: resolveApp(".env"),
  appPath: resolveApp("."),
  appBuild: resolveApp(buildPath),
  appPublic: resolveApp("public"),
  appHtml: resolveApp("public/index.html"),
  appIndexJs: resolveModule(resolveApp, "src/index"),
  appPackageJson: resolveApp("package.json"),
  appSrc: resolveApp("src"),
  appTsConfig: resolveApp("tsconfig.json"),
  appJsConfig: resolveApp("jsconfig.json"),
  yarnLockFile: resolveApp("yarn.lock"),
  testsSetup: resolveModule(resolveApp, "src/setupTests"),
  proxySetup: resolveApp("src/setupProxy.js"),
  appNodeModules: resolveApp("node_modules"),
  swSrc: resolveModule(resolveApp, "src/service-worker"),
  publicUrlOrPath,
};

module.exports.moduleFileExtensions = moduleFileExtensions;
