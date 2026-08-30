import React from "react";
import cstyles from "../common/Common.module.css";
import styles from "./DetailLine.module.css";
import Utils from "../../utils/utils";

type DetailLineProps = {
  label: string;
  // ReactNode so callers can interleave inline icons / badges with the text
  // (e.g. a status badge next to a value). String values still work
  // unchanged because string is assignable to ReactNode.
  value: React.ReactNode;
  failed?: boolean;
};

/**
 * A fact stated as a definition: the label on the left, the value on the right,
 * one to a line. Distinct from `Field`, which stacks the label over the value
 * so several can sit across one row — this is for a list read down.
 *
 * The label used to end in a colon. Nothing else in the app punctuates a label,
 * so it read as the older of the two shapes rather than a different one.
 */
const DetailLine = ({ label, value, failed }: DetailLineProps) => {
  return (
    <div className={styles.detailline}>
      <div className={cstyles.sublight}>{label}</div>
      <div className={cstyles.breakword} style={failed ? { color: Utils.getCssVariable("--color-error") } : {}}>
        {value}
      </div>
    </div>
  );
};

export default DetailLine;
