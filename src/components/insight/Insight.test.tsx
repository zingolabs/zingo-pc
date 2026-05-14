import React from "react";
import { render, screen } from "../../test-utils";

jest.mock("../../electronBridge");

// chart.js tries to use canvas — mock it out entirely
jest.mock("react-chartjs-2", () => ({
  Chart: () => <div data-testid="chart" />,
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Insight = require("./Insight").default;

describe("Insight", () => {
  it("renders without crashing", () => {
    render(<Insight />);
  });

  it("renders section labels that are always present", () => {
    render(<Insight />);
    expect(screen.getByText("Financial Insight")).toBeInTheDocument();
    expect(screen.getByText("Sent amounts")).toBeInTheDocument();
    expect(screen.getByText("Number of sends")).toBeInTheDocument();
  });
});
