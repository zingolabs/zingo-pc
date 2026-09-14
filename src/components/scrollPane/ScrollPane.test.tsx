import React from "react";
import { fireEvent, render, screen } from "../../test-utils";
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

  describe("anchored to the bottom", () => {
    // jsdom lays nothing out, so the element's scroll geometry is stated.
    const geometry = (el: HTMLElement, g: { scrollHeight: number; clientHeight: number }) => {
      let top = 0;
      Object.defineProperty(el, "scrollHeight", { configurable: true, get: () => g.scrollHeight });
      Object.defineProperty(el, "clientHeight", { configurable: true, get: () => g.clientHeight });
      Object.defineProperty(el, "scrollTop", { configurable: true, get: () => top, set: (v: number) => (top = v) });
    };

    // The screen measures what sits above the pane after the first paint, and
    // the pane shrinks: its end must not slide out of view.
    it("stays at its end when it shrinks", () => {
      const { rerender } = render(
        <ScrollPaneTop offsetHeight={100} initialScrollType="bottom">
          <span>last message</span>
        </ScrollPaneTop>,
      );
      const pane = screen.getByText("last message").parentElement as HTMLDivElement;
      geometry(pane, { scrollHeight: 2000, clientHeight: 500 });

      rerender(
        <ScrollPaneTop offsetHeight={180} initialScrollType="bottom">
          <span>last message</span>
        </ScrollPaneTop>,
      );

      expect(pane.scrollTop).toBe(2000);
    });

    it("leaves the position alone once the user has scrolled up", () => {
      const { rerender } = render(
        <ScrollPaneTop offsetHeight={100} initialScrollType="bottom">
          <span>last message</span>
        </ScrollPaneTop>,
      );
      const pane = screen.getByText("last message").parentElement as HTMLDivElement;
      geometry(pane, { scrollHeight: 2000, clientHeight: 500 });
      pane.scrollTop = 300;
      fireEvent.scroll(pane);

      rerender(
        <ScrollPaneTop offsetHeight={180} initialScrollType="bottom">
          <span>last message</span>
        </ScrollPaneTop>,
      );

      expect(pane.scrollTop).toBe(300);
    });
  });
});
