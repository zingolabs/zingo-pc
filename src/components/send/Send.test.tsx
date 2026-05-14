import React from "react";
import { render } from "../../test-utils";

jest.mock("../../electronBridge");

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Send = require("./Send").default;

test("Send renders without crashing", () => {
  render(<Send sendTransaction={jest.fn().mockResolvedValue("txid")} setSendPageState={jest.fn()} />);
});
