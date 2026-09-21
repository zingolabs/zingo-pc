import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy } from "@fortawesome/free-solid-svg-icons";

import cstyles from "./Common.module.css";
import Utils from "../../utils/utils";
import { useCopy } from "./useCopy";

/** How much of a code is shown while it is folded: enough to recognise it by. */
const SHORT_EDGE = 12;

/** A button that is a piece of text: no chrome of its own, just pressable. */
const plainButton: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  color: "inherit",
  font: "inherit",
  textAlign: "left",
  cursor: "pointer",
};

/**
 * One labelled fact, and the same one with a copy button.
 *
 * Every swap modal states facts, and each had grown its own version of this:
 * one labelled at the body size, one at the small size, one breaking its value
 * on word boundaries and another anywhere. Reading two of them side by side
 * made the screens look unrelated.
 *
 * The label sits above the value rather than beside it, which is the shape the
 * transfer detail uses, and each field carries its own top padding so a row of
 * them and a stack of them space the same.
 */
export function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className={cstyles.padtopsmall}>
      <div className={cstyles.sublight}>{label}</div>
      <div className={cstyles.breakword}>{value}</div>
    </div>
  );
}

/**
 * A field the user has to reproduce somewhere else, so it carries the button
 * that saves them retyping it. Otherwise identical to `Field`, which is the
 * point: an address does not look like a different kind of thing from the
 * amount above it just because one can be copied.
 *
 * Every code in the app is read the same way here. A transaction id or a
 * unified address is sixty to two hundred characters that nobody reads through:
 * folded to its two ends, it can still be recognised, and it leaves the field
 * one line tall like every other. Pressing it opens it over two lines — enough
 * to check the whole of it, not enough for one field to take the screen — and
 * pressing it again folds it back.
 *
 * The copy button says so where the eye already is: beside the label, not in a
 * line at the foot of the view that the reader is not looking at and that a
 * scrolled pane often hides altogether.
 */
export function CopyField({ label, value, note }: { label: string; value: string; note?: React.ReactNode }) {
  const { copied, copy } = useCopy(1500);
  const [expanded, setExpanded] = useState<boolean>(false);
  const folded: string = Utils.trimToSmall(value, SHORT_EDGE);
  const foldable: boolean = folded !== value;

  return (
    <div className={cstyles.padtopsmall}>
      <div className={cstyles.sublight}>
        {label}
        {copied && (
          <span className={cstyles.highlight} style={{ marginLeft: 8 }}>
            Copied!
          </span>
        )}
      </div>
      {note}
      <div className={cstyles.horizontalflex} style={{ alignItems: "center", gap: 8 }}>
        {foldable ? (
          <button
            type="button"
            aria-label={expanded ? `Fold ${label}` : `Show ${label} in full`}
            className={cstyles.breakword}
            style={plainButton}
            onClick={() => setExpanded((wasExpanded) => !wasExpanded)}
          >
            {expanded
              ? Utils.splitStringIntoChunks(value, 2).map((chunk, index) => (
                  <div key={`${index}-${chunk}`}>{chunk}</div>
                ))
              : folded}
          </button>
        ) : (
          <div className={cstyles.breakword}>{value}</div>
        )}
        <button
          type="button"
          aria-label={`Copy ${label}`}
          style={{ ...plainButton, lineHeight: 1 }}
          onClick={() => copy(value)}
        >
          <FontAwesomeIcon icon={faCopy} />
        </button>
      </div>
    </div>
  );
}

/**
 * A line of fields, side by side.
 *
 * The gap is what keeps a long value — an address, a route id — from running
 * into the field beside it, which `space-between` alone does not prevent once
 * one column grows wide enough.
 */
export function FieldRow({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className={`${cstyles.flexspacebetween} ${cstyles.padtopsmall}`} style={{ gap: 16, ...style }}>
      {children}
    </div>
  );
}
