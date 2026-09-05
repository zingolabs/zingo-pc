import React from "react";

/**
 * The direction-toggle glyph: two arrows, top pointing right and bottom
 * pointing left.
 *
 * Ported verbatim from the mobile wallet's `SwapFilledIcon`; `react-native-svg`
 * becomes plain SVG, which is the same markup with different element names.
 */
type SwapFilledIconProps = { size?: number; color?: string };

export function SwapFilledIcon({ size = 28, color = "#000" }: SwapFilledIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ display: "block" }}>
      {/* Top arrow pointing right */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M14.293 2.293a1 1 0 0 1 1.414 0l5 5a1 1 0 0 1 0 1.414l-5 5a1 1 0 0 1-1.414-1.414L17.586 9H3a1 1 0 1 1 0-2h14.586l-3.293-3.293a1 1 0 0 1 0-1.414Z"
        fill={color}
      />
      {/* Bottom arrow pointing left */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M9.707 21.707a1 1 0 0 1-1.414 0l-5-5a1 1 0 0 1 0-1.414l5-5a1 1 0 0 1 1.414 1.414L6.414 15H21a1 1 0 1 1 0 2H6.414l3.293 3.293a1 1 0 0 1 0 1.414Z"
        fill={color}
      />
    </svg>
  );
}

export default SwapFilledIcon;
