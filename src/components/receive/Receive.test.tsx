import React from "react";
import { render } from "../../test-utils";

jest.mock("../../electronBridge");
jest.mock("../../rpc/rpc", () => ({ __esModule: true, default: {} }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Receive = require("./Receive").default;

test("Receive renders without crashing", () => {
  render(<Receive />);
});
