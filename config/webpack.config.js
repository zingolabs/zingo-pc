const fs = require("fs");
const path = require("path");
const webpack = require("webpack");
const resolve = require("resolve");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CaseSensitivePathsPlugin = require("case-sensitive-paths-webpack-plugin");
const TerserPlugin = require("terser-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const LavaMoatPlugin = require("@lavamoat/webpack");
const CssMinimizerPlugin = require("css-minimizer-webpack-plugin");
const { WebpackManifestPlugin } = require("webpack-manifest-plugin");
const WorkboxWebpackPlugin = require("workbox-webpack-plugin");
const ESLintPlugin = require("eslint-webpack-plugin");
const ForkTsCheckerWebpackPlugin = require("fork-ts-checker-webpack-plugin");
const ReactRefreshWebpackPlugin = require("@pmmmwh/react-refresh-webpack-plugin");
const paths = require("./paths");
const modules = require("./modules");
const getClientEnvironment = require("./env");

const postcssNormalize = require("postcss-normalize");

const appPackageJson = require(paths.appPackageJson);

const shouldUseSourceMap = process.env.GENERATE_SOURCEMAP !== "false";
const shouldInlineRuntimeChunk = process.env.INLINE_RUNTIME_CHUNK !== "false";
const emitErrorsAsWarnings = process.env.ESLINT_NO_DEV_ERRORS === "true";
const disableESLintPlugin = process.env.DISABLE_ESLINT_PLUGIN === "true";
const imageInlineSizeLimit = parseInt(process.env.IMAGE_INLINE_SIZE_LIMIT || "10000");
const useTypeScript = fs.existsSync(paths.appTsConfig);
const swSrc = paths.swSrc;

const cssRegex = /\.css$/;
const cssModuleRegex = /\.module\.css$/;
const sassRegex = /\.(scss|sass)$/;
const sassModuleRegex = /\.module\.(scss|sass)$/;

const hasJsxRuntime = (() => {
  if (process.env.DISABLE_NEW_JSX_TRANSFORM === "true") {
    return false;
  }
  try {
    require.resolve("react/jsx-runtime");
    return true;
  } catch (e) {
    return false;
  }
})();

// Inlined replacement for react-dev-utils/InterpolateHtmlPlugin.
// Replaces %VAR% tokens in the HTML template with values from env.raw.
class HtmlInterpolatePlugin {
  constructor(replacements) {
    this.replacements = replacements;
  }
  apply(compiler) {
    compiler.hooks.compilation.tap("HtmlInterpolatePlugin", (compilation) => {
      HtmlWebpackPlugin.getHooks(compilation).beforeEmit.tap("HtmlInterpolatePlugin", (data) => {
        Object.keys(this.replacements).forEach((key) => {
          const value = this.replacements[key];
          data.html = data.html.replace(new RegExp("%" + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "%", "g"), value);
        });
        return data;
      });
    });
  }
}

module.exports = function (webpackEnv) {
  const isEnvDevelopment = webpackEnv === "development";
  const isEnvProduction = webpackEnv === "production";
  const isEnvProductionProfile = isEnvProduction && process.argv.includes("--profile");

  const env = getClientEnvironment(paths.publicUrlOrPath.slice(0, -1));
  const shouldUseReactRefresh = env.raw.FAST_REFRESH;

  const getStyleLoaders = (cssOptions, preProcessor) => {
    const loaders = [
      isEnvDevelopment && require.resolve("style-loader"),
      isEnvProduction && {
        loader: MiniCssExtractPlugin.loader,
        options: paths.publicUrlOrPath.startsWith(".") ? { publicPath: "../../" } : {},
      },
      {
        loader: require.resolve("css-loader"),
        options: cssOptions,
      },
      {
        loader: require.resolve("postcss-loader"),
        options: {
          postcssOptions: {
            plugins: [
              require("postcss-flexbugs-fixes"),
              require("postcss-preset-env")({
                autoprefixer: { flexbox: "no-2009" },
                stage: 3,
              }),
              postcssNormalize(),
            ],
          },
          sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
        },
      },
    ].filter(Boolean);
    // MiniCssExtractPlugin runs these modules at build time, outside any
    // Compartment, and marking them excluded tells LavaMoat not to wrap them.
    if (isEnvProduction) {
      loaders.push(LavaMoatPlugin.exclude);
    }
    if (preProcessor) {
      loaders.push(
        {
          loader: require.resolve("resolve-url-loader"),
          options: {
            sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
            root: paths.appSrc,
          },
        },
        {
          loader: require.resolve(preProcessor),
          options: { sourceMap: true },
        },
      );
    }
    return loaders;
  };

  return {
    target: "web",
    mode: isEnvProduction ? "production" : isEnvDevelopment && "development",
    bail: isEnvProduction,
    devtool: isEnvProduction
      ? shouldUseSourceMap
        ? "source-map"
        : false
      : isEnvDevelopment && "cheap-module-source-map",
    entry: paths.appIndexJs,
    // MiniCssExtractPlugin runs the stylesheet modules at build time through
    // webpack's executeModule, which gives them a chunk of their own named
    // "build time chunk" and a runtime LavaMoat reports as a possible
    // interference. Those modules are the ones marked LavaMoatPlugin.exclude
    // below, and CI treats warnings as errors.
    ignoreWarnings: isEnvProduction
      ? [/LavaMoatPlugin: Something was generating runtime before all modules were identified.*'build time chunk'/]
      : undefined,
    output: {
      path: isEnvProduction ? paths.appBuild : undefined,
      pathinfo: isEnvDevelopment,
      filename: isEnvProduction ? "static/js/[name].[contenthash:8].js" : isEnvDevelopment && "static/js/bundle.js",
      chunkFilename: isEnvProduction
        ? "static/js/[name].[contenthash:8].chunk.js"
        : isEnvDevelopment && "static/js/[name].chunk.js",
      assetModuleFilename: "static/media/[name].[hash][ext]",
      publicPath: paths.publicUrlOrPath,
      devtoolModuleFilenameTemplate: isEnvProduction
        ? (info) => path.relative(paths.appSrc, info.absoluteResourcePath).replace(/\\/g, "/")
        : isEnvDevelopment && ((info) => path.resolve(info.absoluteResourcePath).replace(/\\/g, "/")),
      chunkLoadingGlobal: `webpackJsonp${appPackageJson.name}`,
      globalObject: "this",
    },
    optimization: {
      minimize: isEnvProduction,
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            parse: { ecma: 8 },
            compress: { ecma: 5, comparisons: false, inline: 2 },
            mangle: { safari10: true },
            keep_classnames: isEnvProductionProfile,
            keep_fnames: isEnvProductionProfile,
            format: { ecma: 5, comments: false, ascii_only: true },
          },
        }),
        new CssMinimizerPlugin(),
      ],
      splitChunks: isEnvProduction ? { chunks: "all", name: false } : false,
      runtimeChunk: isEnvProduction ? { name: (entrypoint) => `runtime-${entrypoint.name}` } : false,
    },
    resolve: {
      modules: ["node_modules", paths.appNodeModules].concat(modules.additionalModulePaths || []),
      extensions: paths.moduleFileExtensions
        .map((ext) => `.${ext}`)
        .filter((ext) => useTypeScript || !ext.includes("ts")),
      alias: {
        "react-native": "react-native-web",
        ...(isEnvProductionProfile && {
          "react-dom$": "react-dom/profiling",
          "scheduler/tracing": "scheduler/tracing-profiling",
        }),
        ...(modules.webpackAliases || {}),
      },
      // webpack 5 stopped auto-polyfilling Node.js built-ins.
      // Renderer runs with nodeIntegration:false so use browser-compatible polyfills.
      fallback: {
        path: require.resolve("path-browserify"),
        events: require.resolve("events/events.js"),
        module: false,
        dgram: false,
        dns: false,
        fs: false,
        http2: false,
        net: false,
        tls: false,
        child_process: false,
      },
    },
    module: {
      strictExportPresence: true,
      rules: [
        {
          oneOf: [
            {
              test: [/\.avif$/],
              type: "asset",
              mimetype: "image/avif",
              parser: { dataUrlCondition: { maxSize: imageInlineSizeLimit } },
            },
            {
              test: [/\.bmp$/, /\.gif$/, /\.jpe?g$/, /\.png$/],
              type: "asset",
              parser: { dataUrlCondition: { maxSize: imageInlineSizeLimit } },
            },
            {
              test: /\.(js|mjs|jsx|ts|tsx)$/,
              include: paths.appSrc,
              loader: require.resolve("babel-loader"),
              options: {
                customize: require.resolve("babel-preset-react-app/webpack-overrides"),
                presets: [
                  [require.resolve("babel-preset-react-app"), { runtime: hasJsxRuntime ? "automatic" : "classic" }],
                ],
                plugins: [
                  require.resolve("@babel/plugin-transform-class-properties"),
                  require.resolve("@babel/plugin-transform-private-methods"),
                  require.resolve("@babel/plugin-transform-private-property-in-object"),
                  isEnvDevelopment && shouldUseReactRefresh && require.resolve("react-refresh/babel"),
                ].filter(Boolean),
                cacheDirectory: true,
                cacheCompression: false,
                compact: isEnvProduction,
              },
            },
            {
              test: /\.node$/,
              use: [
                {
                  loader: path.resolve("./internals/NativeLoader.js"),
                  options: { name: "native.node" },
                },
              ],
            },
            {
              test: /\.(js|mjs)$/,
              exclude: /@babel(?:\/|\\{1,2})runtime/,
              loader: require.resolve("babel-loader"),
              options: {
                babelrc: false,
                configFile: false,
                compact: false,
                presets: [[require.resolve("babel-preset-react-app/dependencies"), { helpers: true }]],
                cacheDirectory: true,
                cacheCompression: false,
                sourceMaps: shouldUseSourceMap,
                inputSourceMap: shouldUseSourceMap,
              },
            },
            {
              test: cssRegex,
              exclude: cssModuleRegex,
              use: getStyleLoaders({
                importLoaders: 1,
                sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
                modules: { mode: "icss" },
              }),
              sideEffects: true,
            },
            {
              test: cssModuleRegex,
              use: getStyleLoaders({
                importLoaders: 1,
                sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
                modules: {
                  mode: "local",
                  localIdentName: "[local]--[hash:base64:5]",
                },
              }),
            },
            {
              test: sassRegex,
              exclude: sassModuleRegex,
              use: getStyleLoaders(
                {
                  importLoaders: 3,
                  sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
                  modules: { mode: "icss" },
                },
                "sass-loader",
              ),
              sideEffects: true,
            },
            {
              test: sassModuleRegex,
              use: getStyleLoaders(
                {
                  importLoaders: 3,
                  sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
                  modules: {
                    mode: "local",
                    localIdentName: "[local]--[hash:base64:5]",
                  },
                },
                "sass-loader",
              ),
            },
            {
              exclude: [/\.(js|mjs|jsx|ts|tsx)$/, /\.html$/, /\.json$/],
              type: "asset/resource",
            },
          ],
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin(
        Object.assign(
          {},
          {
            inject: true,
            template: paths.appHtml,
            // The template loads the SES shim and lockdown.js itself unless
            // LavaMoat, production only, inlines lockdown into the runtime chunk.
            lavamoat: isEnvProduction,
          },
          isEnvProduction
            ? {
                minify: {
                  removeComments: true,
                  collapseWhitespace: true,
                  removeRedundantAttributes: true,
                  useShortDoctype: true,
                  removeEmptyAttributes: true,
                  removeStyleLinkTypeAttributes: true,
                  keepClosingSlash: true,
                  minifyJS: true,
                  minifyCSS: true,
                  minifyURLs: true,
                },
              }
            : undefined,
        ),
      ),
      new HtmlInterpolatePlugin(env.raw),
      // Production only: every dependency runs in its own Compartment with the
      // globals its policy grants (lavamoat/webpack/policy.json, regenerated
      // with LAVAMOAT_GENERATE_POLICY=1). Incompatible with Hot Module
      // Replacement, so development keeps the plain lockdown from the template.
      isEnvProduction &&
        new LavaMoatPlugin({
          generatePolicy: process.env.LAVAMOAT_GENERATE_POLICY === "1",
          // The runtime chunk is the first script the page runs.
          inlineLockdown: /runtime-main\.[a-f0-9]+\.js$/,
          // Same options as public/lockdown.js.
          lockdown: {
            errorTaming: "unsafe",
            consoleTaming: "unsafe",
            errorTrapping: "none",
            unhandledRejectionTrapping: "none",
            overrideTaming: "severe",
            stackFiltering: "verbose",
            evalTaming: "unsafe-eval",
          },
          // Keeps package names in the bundle, so a policy violation names
          // the package instead of a number.
          readableResourceIds: true,
          runChecks: true,
          // Level 1 adds an informational warning about CSS modules generated
          // before the paths were known, and CI treats warnings as errors.
          // The warning that matters (a module possibly left unwrapped) is
          // emitted at every level.
          diagnosticsVerbosity: 0,
          // A build with LAVAMOAT_DEBUG_RUNTIME=1 lets every access through,
          // logs "-- missing <global> from <package>" instead, and
          // LM_printPolicyDebug() in the console prints what
          // policy-override.json still lacks. For finding gaps, never for a
          // release.
          debugRuntime: process.env.LAVAMOAT_DEBUG_RUNTIME === "1",
        }),
      new webpack.DefinePlugin(env.stringified),
      isEnvDevelopment && shouldUseReactRefresh && new ReactRefreshWebpackPlugin({ overlay: false }),
      isEnvDevelopment && new CaseSensitivePathsPlugin(),
      isEnvProduction &&
        new MiniCssExtractPlugin({
          filename: "static/css/[name].[contenthash:8].css",
          chunkFilename: "static/css/[name].[contenthash:8].chunk.css",
        }),
      new WebpackManifestPlugin({
        fileName: "asset-manifest.json",
        publicPath: paths.publicUrlOrPath,
        generate: (seed, files, entrypoints) => {
          const manifestFiles = files.reduce((manifest, file) => {
            manifest[file.name] = file.path;
            return manifest;
          }, seed);
          const entrypointFiles = entrypoints.main.filter((fileName) => !fileName.endsWith(".map"));
          return { files: manifestFiles, entrypoints: entrypointFiles };
        },
      }),
      new webpack.IgnorePlugin({
        resourceRegExp: /^\.\/locale$/,
        contextRegExp: /moment$/,
      }),
      isEnvProduction &&
        fs.existsSync(swSrc) &&
        new WorkboxWebpackPlugin.InjectManifest({
          swSrc,
          dontCacheBustURLsMatching: /\.[0-9a-f]{8}\./,
          exclude: [/\.map$/, /asset-manifest\.json$/, /LICENSE/],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        }),
      useTypeScript &&
        new ForkTsCheckerWebpackPlugin({
          async: isEnvDevelopment,
          typescript: {
            typescriptPath: resolve.sync("typescript", {
              basedir: paths.appNodeModules,
            }),
            configOverwrite: {
              compilerOptions: {
                sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
                skipLibCheck: true,
                inlineSourceMap: false,
                declarationMap: false,
                noEmit: true,
                incremental: true,
              },
            },
            context: paths.appPath,
            diagnosticOptions: { syntactic: true },
            mode: "write-references",
          },
          issue: {
            include: [{ file: "../**/src/**/*.{ts,tsx}" }, { file: "**/src/**/*.{ts,tsx}" }],
            exclude: [
              { file: "**/src/**/__tests__/**" },
              { file: "**/src/**/?(*.){spec,test}.*" },
              { file: "**/src/setupProxy.*" },
              { file: "**/src/setupTests.*" },
            ],
          },
          logger: "webpack-infrastructure",
        }),
      !disableESLintPlugin &&
        new ESLintPlugin({
          extensions: ["js", "mjs", "jsx", "ts", "tsx"],
          eslintPath: require.resolve("eslint"),
          failOnError: !(isEnvDevelopment && emitErrorsAsWarnings),
          context: paths.appSrc,
          cache: true,
          cacheLocation: path.resolve(paths.appNodeModules, ".cache/.eslintcache"),
          cwd: paths.appPath,
          resolvePluginsRelativeTo: __dirname,
          baseConfig: {
            extends: [require.resolve("eslint-config-react-app/base")],
            rules: {
              ...(!hasJsxRuntime && { "react/react-in-jsx-scope": "error" }),
            },
          },
        }),
    ].filter(Boolean),
    performance: false,
  };
};
