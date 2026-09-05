import React from "react";
import { render, screen } from "@testing-library/react";
import { usePaneOffset } from "./usePaneOffset";

/**
 * The measurement runs after every render, which is the part worth pinning
 * down: a header that grows must move the pane, and one that does not must not
 * set off an endless chain of updates.
 */
function Harness({ headerHeight }: { headerHeight: number }) {
  const { paneRef, paneOffset } = usePaneOffset(203);
  return (
    <div>
      <div style={{ height: headerHeight }} />
      <div ref={paneRef} data-testid="pane" />
      <div data-testid="offset">{paneOffset}</div>
    </div>
  );
}

describe("usePaneOffset", () => {
  // jsdom lays nothing out, so every rect is zero. The fallback is what a
  // screen renders with until a real layout says otherwise.
  it("falls back where there is no layout to measure", () => {
    render(<Harness headerHeight={0} />);

    expect(screen.getByTestId("offset")).toHaveTextContent("203");
  });

  it("takes the measured top once the pane has one", () => {
    jest.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top: 411 } as DOMRect);

    render(<Harness headerHeight={0} />);

    expect(screen.getByTestId("offset")).toHaveTextContent("411");
    jest.restoreAllMocks();
  });

  // The effect has no dependency list on purpose. Without the bail-out, every
  // render would measure, set state, and render again forever — so the test
  // that matters is that a render with unchanged layout produces exactly one
  // more render, not two and not an unbounded stream of them.
  it("does not re-render itself when the measurement is unchanged", () => {
    let renders = 0;
    jest.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top: 88 } as DOMRect);

    function Counted() {
      renders += 1;
      const { paneRef, paneOffset } = usePaneOffset(203);
      return <div ref={paneRef}>{paneOffset}</div>;
    }
    const { rerender } = render(<Counted />);

    // Counted from here, so the mount's own renders do not enter into it.
    renders = 0;
    rerender(<Counted />);

    expect(renders).toBe(1);
    jest.restoreAllMocks();
  });
});

describe("usePaneOffset with a footer", () => {
  function Footed({ footerHeight }: { footerHeight: number }) {
    const { paneRef, footerRef, paneOffset } = usePaneOffset(203);
    return (
      <div>
        <div ref={paneRef} data-testid="pane" />
        <div ref={footerRef} style={{ height: footerHeight }} />
        <div data-testid="offset">{paneOffset}</div>
      </div>
    );
  }

  // A pane with buttons under it may not have the whole window below its top.
  // Without this, Send and the send confirmation could not use the hook at all,
  // which is why both were still passing a constant.
  it("leaves the footer's height to the footer", () => {
    jest.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top: 400, height: 90 } as DOMRect);

    render(<Footed footerHeight={90} />);

    expect(screen.getByTestId("offset")).toHaveTextContent("490");
    jest.restoreAllMocks();
  });

  // Every screen whose pane runs to the bottom leaves the ref unattached, and
  // has to keep measuring exactly what it did before.
  it("subtracts nothing when no footer is attached", () => {
    jest.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top: 400, height: 90 } as DOMRect);

    render(<Harness headerHeight={0} />);

    expect(screen.getByTestId("offset")).toHaveTextContent("400");
    jest.restoreAllMocks();
  });
});
