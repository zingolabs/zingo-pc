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
 * `ScrollPaneTop` keeps its existing contract rather than measuring itself.
 * What a pane may occupy is not always the window below its own top: a screen
 * can draw buttons under the list, and that space is the pane's to leave alone.
 * Attach `footerRef` to whatever sits below and its height comes off too; leave
 * it unattached and nothing does, which is every screen whose pane runs to the
 * bottom of the window.
 */
export function usePaneOffset(fallback: number) {
  const paneRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const [paneOffset, setPaneOffset] = useState<number>(fallback);

  // Deliberately without a dependency list: the point is to run after every
  // render, and any list would name the state of a screen this hook knows
  // nothing about.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const next = measure(paneRef.current, footerRef.current);
    if (next === null) return;
    setPaneOffset((previous) => (previous === next ? previous : next));
  });

  useLayoutEffect(() => {
    const remeasure = () => {
      const next = measure(paneRef.current, footerRef.current);
      if (next !== null) setPaneOffset(next);
    };
    window.addEventListener("resize", remeasure);
    return () => window.removeEventListener("resize", remeasure);
  }, []);

  return { paneRef, footerRef, paneOffset };
}

/**
 * Everything the window height owes to something other than the pane: the
 * distance down to it, plus the height of whatever is drawn beneath it. Null
 * when there is no layout to read.
 *
 * Only the footer's height is taken, never its position. Its position moves
 * when the pane is resized and its height does not, which is what keeps this
 * from measuring its own effect.
 */
function measure(pane: HTMLDivElement | null, footer: HTMLDivElement | null): number | null {
  const top = pane?.getBoundingClientRect().top;
  if (top === undefined || top <= 0) return null;
  return top + (footer?.getBoundingClientRect().height ?? 0);
}
