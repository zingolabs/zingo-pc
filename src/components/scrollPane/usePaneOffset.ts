import { useLayoutEffect, useRef, useState } from "react";

/**
 * Where a scroll pane starts, measured rather than guessed.
 *
 * `ScrollPaneTop` sizes itself as the window height minus an offset, and every
 * screen used to pass that offset as a constant. A constant is only ever right
 * for one arrangement of what sits above the pane, and these headers are not
 * fixed: a validation line appears, a section exists only while the list is
 * non-empty, a balance gains a block for the wallet's pools. When the constant
 * came out too small the pane ran past the bottom of the window, and the last
 * row could not be scrolled to.
 *
 * The measurement runs after every render because everything that moves this
 * boundary moves it through a React render. That cannot loop: the update is
 * written as a bail-out, so an unchanged measurement re-renders nothing, and
 * the pane's top is decided by what sits above it rather than by its own
 * height, so it does not move in response to being resized.
 *
 * The fallback is used for the first paint and wherever there is no layout to
 * measure. A top of zero counts as the latter: every screen using this draws a
 * title above its pane, so a pane at the very top of the viewport is an
 * element that has not been laid out — hidden, or measured too early. Taking
 * that literally would size the pane to the whole window, which is the exact
 * overflow this hook exists to prevent.
 *
 * `ScrollPaneTop` keeps its existing contract rather than measuring itself:
 * Send draws its buttons below its own pane, and a component that decided this
 * for everyone would break it.
 */
export function usePaneOffset(fallback: number) {
  const paneRef = useRef<HTMLDivElement>(null);
  const [paneOffset, setPaneOffset] = useState<number>(fallback);

  // Deliberately without a dependency list: the point is to run after every
  // render, and any list would name the state of a screen this hook knows
  // nothing about.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const top = measure(paneRef.current);
    if (top === null) return;
    setPaneOffset((previous) => (previous === top ? previous : top));
  });

  useLayoutEffect(() => {
    const remeasure = () => {
      const top = measure(paneRef.current);
      if (top !== null) setPaneOffset(top);
    };
    window.addEventListener("resize", remeasure);
    return () => window.removeEventListener("resize", remeasure);
  }, []);

  return { paneRef, paneOffset };
}

/** The pane's distance from the top of the viewport, or null when there is no layout to read. */
function measure(pane: HTMLDivElement | null): number | null {
  const top = pane?.getBoundingClientRect().top;
  return top === undefined || top <= 0 ? null : top;
}
