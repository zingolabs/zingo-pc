import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

type ScrollPaneTopProps = {
  children: React.ReactNode;
  className?: string;
  offsetHeight: number;
  initialScrollType?: "top" | "bottom";
};

const ScrollPaneTop: React.FC<ScrollPaneTopProps> = ({
  children,
  className,
  offsetHeight,
  initialScrollType = "top",
}) => {
  const [height, setHeight] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const isInitialLoad = useRef<boolean>(true);
  // Whether a bottom-anchored pane is showing its end. It starts there, and
  // stays there until the user scrolls up.
  const pinnedToBottom = useRef<boolean>(initialScrollType === "bottom");

  const updateDimensions = useCallback(() => {
    const updateHeight = window.innerHeight - offsetHeight;
    setHeight(updateHeight);
  }, [offsetHeight]);

  useEffect(() => {
    updateDimensions();
    window.addEventListener("resize", updateDimensions);

    return () => {
      window.removeEventListener("resize", updateDimensions);
    };
  }, [updateDimensions]);

  useLayoutEffect(() => {
    if (!isInitialLoad.current || !containerRef.current) return;

    const scrollToBottom = () => {
      if (containerRef.current) {
        containerRef.current.scrollTop = initialScrollType === "top" ? 0 : containerRef.current.scrollHeight;
        isInitialLoad.current = false;
      }
    };

    const id = setTimeout(() => {
      requestAnimationFrame(scrollToBottom);
    }, 10);
    return () => clearTimeout(id);
  }, [initialScrollType]);

  // A pane that shrinks keeps its scrollTop, so the end it was showing slides
  // out of view below. That happens right after the first paint, when the
  // screen measures what sits above the pane and its offset grows: Messages
  // opened with part of the last message hidden. The list also fills in after
  // the first paint. A bottom-anchored pane that was at its end is taken back
  // there after every render, so neither leaves it short of the end.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (initialScrollType !== "bottom" || !el || !pinnedToBottom.current) return;
    el.scrollTop = el.scrollHeight;
  });

  const onScroll = () => {
    const el = containerRef.current;
    if (initialScrollType !== "bottom" || !el) return;
    pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 2;
  };

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ overflowY: "auto", overflowX: "hidden", height }}
      onScroll={onScroll}
    >
      {children}
    </div>
  );
};

export default ScrollPaneTop;
