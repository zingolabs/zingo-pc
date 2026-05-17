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

  it("applies the className prop to the container wrapping its children", () => {
    render(
      <ScrollPaneTop offsetHeight={50} className="my-pane">
        <span>marker</span>
      </ScrollPaneTop>,
    );
    expect(screen.getByText("marker").parentElement).toHaveClass("my-pane");
  });

  it("computes height as window.innerHeight - offsetHeight", () => {
    const original = window.innerHeight;
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    try {
      render(
        <ScrollPaneTop offsetHeight={120}>
          <span>height marker</span>
        </ScrollPaneTop>,
      );
      const wrapper = screen.getByText("height marker").parentElement as HTMLDivElement;
      expect(wrapper.style.height).toBe("680px");
    } finally {
      Object.defineProperty(window, "innerHeight", { configurable: true, value: original });
    }
  });
});
