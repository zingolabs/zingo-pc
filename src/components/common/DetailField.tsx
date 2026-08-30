import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy } from "@fortawesome/free-solid-svg-icons";

import cstyles from "./Common.module.css";

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
 */
export function CopyField({ label, value, copy }: { label: string; value: string; copy: (value: string) => void }) {
  return (
    <div className={cstyles.padtopsmall}>
      <div className={cstyles.sublight}>{label}</div>
      <div className={cstyles.horizontalflex} style={{ alignItems: "center", gap: 8 }}>
        <div className={cstyles.breakword}>{value}</div>
        <button
          type="button"
          aria-label={`Copy ${label}`}
          style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0 }}
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
