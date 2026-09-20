import React, { useId, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faChevronRight } from "@fortawesome/free-solid-svg-icons";

import cstyles from "./Common.module.css";

type AdvancedSectionProps = {
  /** What the line says. "Advanced" unless a view has a better word for it. */
  label?: string;
  children: React.ReactNode;
};

/**
 * The technical half of a detail view, behind one line the user can open.
 *
 * A swap that went through leaves a page of route ids, order ids, deposit
 * addresses, chain hashes, memos and slippage figures. All of it is worth
 * keeping — it is what answers a support question or a dispute — and almost
 * none of it is what the person who made the swap came to see. Shown together,
 * the two amounts and the provider are lost among the rest.
 *
 * So the view keeps what the swap is about, and everything that explains how
 * it was carried out waits here. Closed on each opening rather than
 * remembered: the plain view is the one worth arriving at, and a reader who
 * wants the rest is one press away from it.
 */
const AdvancedSection: React.FC<AdvancedSectionProps> = ({ label = "Advanced", children }) => {
  const [open, setOpen] = useState<boolean>(false);
  // Ties the line to what it opens, for a reader who cannot see the chevron.
  const contentId = useId();

  return (
    <>
      <hr style={{ width: "100%" }} />
      <div className={cstyles.center}>
        <button
          type="button"
          className={cstyles.disclosurebutton}
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen((wasOpen) => !wasOpen)}
        >
          <FontAwesomeIcon icon={open ? faChevronDown : faChevronRight} />
          {label}
        </button>
      </div>
      {open && (
        <>
          <div id={contentId} className={cstyles.disclosurecontent}>
            {children}
          </div>
          {/* Closes the section the way the rule above it opened it. Without
              one the last fact folded out sat flush against whatever the view
              ends with — in the swap detail, its buttons. */}
          <hr style={{ width: "100%" }} />
        </>
      )}
    </>
  );
};

export default AdvancedSection;
