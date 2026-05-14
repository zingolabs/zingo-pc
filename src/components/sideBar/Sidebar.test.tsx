import React from "react";
import { render } from "../../test-utils";

jest.mock("../../electronBridge");

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Sidebar = require("./Sidebar").default;

test("Sidebar renders without crashing", () => {
  render(
    <Sidebar doRescan={jest.fn()} navigateToLoadingScreenChangingWallet={jest.fn()} setBlockExplorer={jest.fn()} />,
  );
});
