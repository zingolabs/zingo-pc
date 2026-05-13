import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import Root from "./root/Root";

import "./components/common/Global.css";

if (process.env.NODE_ENV !== "development") {
  console.log = () => {};
  console.debug = () => {};
}

const container = document.getElementById("root");
const root = createRoot(container!);

root.render(<Root />);
