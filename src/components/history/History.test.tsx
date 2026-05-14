import React from "react";
import { render } from "../../test-utils";

jest.mock("../../electronBridge");

// eslint-disable-next-line @typescript-eslint/no-require-imports
const History = require("./History").default;

test("History renders without crashing", () => {
  render(<History />);
});
