import React from "react";
import { render } from "../../test-utils";

jest.mock("../../electronBridge");

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Messages = require("./Messages").default;

test("Messages renders without crashing", () => {
  render(<Messages />);
});
