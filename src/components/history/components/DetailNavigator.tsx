import React, { useEffect } from "react";

import cstyles from "../../common/Common.module.css";
import { faArrowDown, faArrowUp } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

type DetailNavigatorProps = {
  /** Position of the row on screen, within the list History is showing. */
  index: number;
  /** How many rows that list holds. */
  length: number;
  /** Step by -1 or 1. History decides what the neighbour is and which detail
   *  view it needs, so a swap sitting between two transfers is reachable. */
  move: (delta: number) => void;
};

/**
 * The up/down stepper both detail views carry.
 *
 * It steps through History's list rather than either modal's own idea of one:
 * the list interleaves swaps with zingolib's transfers, and a stepper that
 * only knew about transfers used to close the modal on reaching a swap.
 *
 * Arrow keys do the same thing. The listener is bound while a detail is open
 * and released with it, so the keys only move a list the user is looking at.
 */
const DetailNavigator: React.FC<DetailNavigatorProps> = ({ index, length, move }) => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowUp") move(-1);
      else if (event.key === "ArrowDown") move(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [move]);

  const atFirst = index <= 0;
  const atLast = index >= length - 1;

  return (
    <div style={{ position: "absolute", alignItems: "center", top: 15, left: 40 }} className={cstyles.horizontalflex}>
      <div
        role={atFirst ? undefined : "button"}
        aria-label={atFirst ? "Previous transaction (disabled)" : "Previous transaction"}
        style={{ marginRight: 25, cursor: "pointer", ...(atFirst ? { opacity: 0.5 } : {}) }}
        onClick={atFirst ? undefined : () => move(-1)}
      >
        <FontAwesomeIcon icon={faArrowUp} size="2x" />
      </div>
      <div>{(index + 1).toString()}</div>
      <div
        role={atLast ? undefined : "button"}
        aria-label={atLast ? "Next transaction (disabled)" : "Next transaction"}
        style={{ marginLeft: 25, cursor: "pointer", ...(atLast ? { opacity: 0.5 } : {}) }}
        onClick={atLast ? undefined : () => move(1)}
      >
        <FontAwesomeIcon icon={faArrowDown} size="2x" />
      </div>
    </div>
  );
};

export default DetailNavigator;
