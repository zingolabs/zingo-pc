import React from "react";
import { render } from "../../test-utils";

jest.mock("../../electronBridge");

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Dashboard = require("./Dashboard").default;

test("Dashboard renders without crashing", () => {
  render(<Dashboard navigateToHistory={jest.fn()} />);
});
