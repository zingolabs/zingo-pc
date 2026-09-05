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
});
