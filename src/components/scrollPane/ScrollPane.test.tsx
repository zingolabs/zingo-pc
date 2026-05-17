import React from "react";
import { render, screen } from "../../test-utils";
import ScrollPaneTop from "./ScrollPane";

describe("ScrollPane", () => {
  it("renders children", () => {
    render(
      <ScrollPaneTop offsetHeight={100}>
        <div>inner content</div>
      </ScrollPaneTop>,
    );
    expect(screen.getByText("inner content")).toBeInTheDocument();
  });

  it("applies the className prop to the container", () => {
    const { container } = render(
      <ScrollPaneTop offsetHeight={50} className="my-pane">
        <span />
      </ScrollPaneTop>,
    );
    expect(container.querySelector(".my-pane")).not.toBeNull();
  });

  it("computes height as window.innerHeight - offsetHeight", () => {
    const original = window.innerHeight;
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    try {
      const { container } = render(
        <ScrollPaneTop offsetHeight={120}>
          <span />
        </ScrollPaneTop>,
      );
      const div = container.firstChild as HTMLDivElement;
      expect(div.style.height).toBe("680px");
    } finally {
      Object.defineProperty(window, "innerHeight", { configurable: true, value: original });
    }
  });
});
