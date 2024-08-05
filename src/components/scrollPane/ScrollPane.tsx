import React, { useCallback, useEffect, useState } from "react";

type ScrollPaneProps = {
  children: React.ReactNode;
  className?: string;
  offsetHeight: number;
};

const ScrollPane: React.FC<ScrollPaneProps> = ({ children, className, offsetHeight }) => {
  const [height, setHeight] = useState<number>(0);

  const updateDimensions = useCallback(() => {
    const updateHeight = window.innerHeight - offsetHeight;
    setHeight(updateHeight);
  }, [offsetHeight]);
  
  useEffect(() => {
    updateDimensions();
    window.addEventListener('resize', updateDimensions);

    return () => {
      window.removeEventListener('resize', updateDimensions);
    };
  }, [updateDimensions]);

  return (
    <div className={className} style={{ overflowY: "auto", overflowX: "hidden", height }}>
      {children}
    </div>
  );
};

export default ScrollPane;
