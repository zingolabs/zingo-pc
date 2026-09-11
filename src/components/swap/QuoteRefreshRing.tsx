import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRotateRight } from "@fortawesome/free-solid-svg-icons";

import styles from "./QuoteRefreshRing.module.css";

/**
 * Manual re-quote control that doubles as an auto-refresh countdown: a refresh
 * glyph wrapped in a ring that fills clockwise from empty to full over
 * `durationMs` (the quote refresh cadence). The ring restarts whenever
 * `resetKey` changes — pass the live quote's `receivedAtMs` so a fresh quote
 * (auto OR manual) resets the fill.
 *
 * Clicking fires `onPress` (a manual re-quote). While `disabled` (a fetch in
 * flight or the post-click cooldown) the whole control dims and ignores clicks.
 *
 * Ported from the mobile wallet's `QuoteRefreshRing`. React Native's `Animated`
 * value driving `strokeDashoffset` becomes a CSS animation over the same
 * property — the platform's own way to do exactly this, and it runs off the
 * main thread. `resetKey` remounts the arc, which is what restarts a CSS
 * animation.
 */
type QuoteRefreshRingProps = {
  size: number;
  /** Centre refresh-glyph colour. */
  color: string;
  /** Progress-arc (fill) colour. Falls back to `color` when omitted. */
  ringColor?: string;
  /** Faint unfilled-track colour. */
  trackColor: string;
  /** Time for the ring to go empty → full (matches the refresh interval). */
  durationMs: number;
  /** Change this to restart the fill from 0 (e.g. the quote's receivedAtMs). */
  resetKey: number | string;
  onPress: () => void;
  disabled?: boolean;
  title?: string;
};

const QuoteRefreshRing: React.FC<QuoteRefreshRingProps> = ({
  size,
  color,
  ringColor,
  trackColor,
  durationMs,
  resetKey,
  onPress,
  disabled,
  title,
}) => {
  const strokeWidth = 2;
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <button
      type="button"
      className={styles.button}
      onClick={onPress}
      disabled={disabled}
      aria-label={title ?? "Refresh the quote"}
      title={title}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className={styles.svg} aria-hidden="true">
        <circle cx={center} cy={center} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        <circle
          // Remounting is what makes the CSS animation start over; without a
          // changing key a second quote would leave the ring already full.
          key={resetKey}
          className={styles.arc}
          cx={center}
          cy={center}
          r={radius}
          stroke={ringColor ?? color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          // Start the fill at 12 o'clock instead of 3 o'clock.
          transform={`rotate(-90 ${center} ${center})`}
          style={
            {
              "--circumference": circumference,
              "--duration": `${durationMs}ms`,
            } as React.CSSProperties
          }
        />
      </svg>
      <FontAwesomeIcon icon={faRotateRight} style={{ fontSize: Math.round(size * 0.48), color }} />
    </button>
  );
};

export default QuoteRefreshRing;
