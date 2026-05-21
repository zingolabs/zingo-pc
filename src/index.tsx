import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import Root from "./root/Root";

import "./components/common/Global.css";

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
