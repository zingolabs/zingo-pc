import React from "react";
import { render, screen } from "../../../test-utils";
import SidebarMenuItem from "./SidebarMenuItem";

const baseProps = {
  name: "Dashboard",
  routeName: "/dashboard",
  currentRoute: "/send",
  iconname: "fa-home",
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

  it("is not active when currentRoute differs", () => {
    const { container } = render(<SidebarMenuItem {...baseProps} currentRoute="/send" />);
    // active class should NOT be applied
    expect(container.querySelector(".sidebarmenuitemactive")).toBeNull();
  });

  it("is active when currentRoute matches routeName", () => {
    const { container } = render(<SidebarMenuItem {...baseProps} currentRoute="/dashboard" />);
    expect(container.querySelector(".sidebarmenuitemactive")).not.toBeNull();
  });
});
