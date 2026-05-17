import React from "react";
import { render, screen } from "@testing-library/react";

// Stub out Routes — Root is only responsible for wrapping it in the router.
// Mounting the real Routes would require setting up window.electronAPI, RPC,
// AddressbookImpl etc. and is covered by its own test (when present).
jest.mock("./Routes", () => () => <div data-testid="routes-stub">routes</div>);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Root = require("./Root").default;

describe("Root", () => {
  it("renders the router with Routes inside", () => {
    render(<Root />);
    expect(screen.getByTestId("routes-stub")).toBeInTheDocument();
  });
});
