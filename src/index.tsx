import React from "react";
import { createRoot } from "react-dom/client";
import { config as faConfig } from "@fortawesome/fontawesome-svg-core";
// FontAwesome ships its sizing rules — `svg-inline--fa { width: 1em }` above
// all — and adds them by creating a <style> element the first time an icon
// renders. Production forbids exactly that: the CSP is `style-src 'self'`
// with no `unsafe-inline`, so the injection is dropped and every icon draws at
// the SVG's intrinsic size — screen-filling padlocks, in a packaged build only.
//
// Imported instead, so webpack bundles it into the app's own stylesheet and it
// arrives from `'self'` like every other style. The policy does not move for
// this: it is a library asking for an exception it does not need.
//
// Invisible in development, where the policy does allow inline styles, which is
// how the icon migration that introduced it passed every check we ran.
import "@fortawesome/fontawesome-svg-core/styles.css";
import "./index.css";
import Root from "./root/Root";

import "./components/common/Global.css";

// Set before the first icon renders: otherwise the library adds the copy the
// import above already provides, and that duplicate is the one the CSP drops.
faConfig.autoAddCss = false;

if (process.env.NODE_ENV !== "development") {
  // Silence all console output in production. The main process's
  // console-message listener writes everything (any level) to startup.log on
  // disk, so leaving error/warn/info/trace active would risk a future
  // `console.error(\`bad seed ${seedStr}\`)` (or similar) leaking sensitive
  // material to a persistent log file.
  const noop = () => {};
  console.log = noop;
  console.debug = noop;
  console.info = noop;
  console.warn = noop;
  console.error = noop;
  console.trace = noop;
}

const container = document.getElementById("root");
const root = createRoot(container!);

root.render(<Root />);
