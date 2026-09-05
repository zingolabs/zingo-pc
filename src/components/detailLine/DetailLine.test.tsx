import React from "react";
import { render, screen } from "../../test-utils";
import DetailLine from "./DetailLine";

// DetailLine pulls Utils → electronBridge, which reads window.electronAPI at
// module load. That global only exists in the Electron preload, so jsdom
// would throw at import time without this mock.
jest.mock("../../electronBridge");

describe("DetailLine", () => {
  it("renders without crashing", () => {
    render(<DetailLine label="Address" value="abc123" />);
  });

  it("displays the label", () => {
    render(<DetailLine label="Address" value="abc123" />);
    expect(screen.getByText("Address")).toBeInTheDocument();
  });

  it("displays the value", () => {
    render(<DetailLine label="Address" value="abc123" />);
    expect(screen.getByText("abc123")).toBeInTheDocument();
  });

  it("renders different label and value without mixing them", () => {
    render(<DetailLine label="Amount" value="1.5 ZEC" />);
    expect(screen.getByText("Amount")).toBeInTheDocument();
    expect(screen.getByText("1.5 ZEC")).toBeInTheDocument();
  });
});
