import React from "react";
import { render, screen } from "../../test-utils";

jest.mock("../../electronBridge");
import Logo from "./Logo";
import APP_VERSION from "../../version";

describe("Logo", () => {
  it("always shows the version string", () => {
    render(<Logo onlyVersion={false} readOnly={false} />);
    expect(screen.getByText(`Zingo PC v${APP_VERSION}`)).toBeInTheDocument();
  });

  it("shows the logo image when onlyVersion is false", () => {
    render(<Logo onlyVersion={false} readOnly={false} />);
    expect(screen.getByRole("img", { name: /logo/i })).toBeInTheDocument();
  });

  it("hides the logo image when onlyVersion is true", () => {
    render(<Logo onlyVersion={true} readOnly={false} />);
    expect(screen.queryByRole("img", { name: /logo/i })).not.toBeInTheDocument();
  });

  it("shows snowflake icon when readOnly is true", () => {
    render(<Logo onlyVersion={false} readOnly={true} />);
    // FontAwesome renders an SVG; we can check the svg element is present
    const svgs = document.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThan(0);
  });
});
