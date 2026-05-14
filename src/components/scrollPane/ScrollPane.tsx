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

  return (
    <div ref={containerRef} className={className} style={{ overflowY: "auto", overflowX: "hidden", height }}>
      {children}
    </div>
  );
};

export default ScrollPaneTop;
