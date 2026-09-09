import React from "react";
import { render, screen } from "../../../test-utils";
import SidebarMenuItem from "./SidebarMenuItem";
import { faHome } from "@fortawesome/free-solid-svg-icons";

const baseProps = {
  name: "Dashboard",
  routeName: "/dashboard",
  currentRoute: "/send",
  iconname: faHome,
};

describe("SidebarMenuItem", () => {
  it("renders the item name", () => {
    render(<SidebarMenuItem {...baseProps} />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("renders a link to the routeName", () => {
    render(<SidebarMenuItem {...baseProps} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/dashboard");
  });

  it("does not have aria-current when route does not match", () => {
    render(<SidebarMenuItem {...baseProps} currentRoute="/send" />);
    expect(screen.getByRole("link")).not.toHaveAttribute("aria-current");
  });

  it("has aria-current='page' when route matches", () => {
    render(<SidebarMenuItem {...baseProps} currentRoute="/dashboard" />);
    expect(screen.getByRole("link")).toHaveAttribute("aria-current", "page");
  });

  // The menu is where a user decides whether to open a screen at all, which is
  // earlier than any warning on the screen itself can reach them.
  it("carries a qualifier under the name when given one", () => {
    render(<SidebarMenuItem {...baseProps} name="Swap" qualifier="experimental" />);
    expect(screen.getByText("Swap")).toBeInTheDocument();
    expect(screen.getByText("experimental")).toBeInTheDocument();
  });

  // The name is what the user is looking for and it has to survive the
  // qualifier: at 20px in a 220px column, a word on the same line would push
  // the longest labels past the edge.
  it("keeps the name and the qualifier apart", () => {
    render(<SidebarMenuItem {...baseProps} name="Swap" qualifier="experimental" />);
    expect(screen.getByText("Swap").textContent).not.toMatch(/experimental/);
  });

  it("says nothing extra without one", () => {
    render(<SidebarMenuItem {...baseProps} />);
    expect(screen.queryByText("experimental")).not.toBeInTheDocument();
  });
});
