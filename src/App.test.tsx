import React from "react";
import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders without crashing", () => {
  render(<App />);
});

test("displays app version string", () => {
  render(<App />);
  expect(screen.getByText(/Zingo PC v/i)).toBeInTheDocument();
});
