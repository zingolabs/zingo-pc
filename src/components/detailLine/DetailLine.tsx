import React from "react";
import cstyles from "../common/Common.module.css";
import styles from "./DetailLine.module.css";

type DetailLineProps = {
  label: string;
  // ReactNode so callers can interleave inline icons / badges with the text
  // (e.g. a Tor onion next to the ZEC Price line). String values still work
  // unchanged because string is assignable to ReactNode.
  value: React.ReactNode;
};

const DetailLine = ({ label, value }: DetailLineProps) => {
  return (
    <div className={styles.detailline}>
      <div className={cstyles.sublight}>{label} :</div>
      <div className={cstyles.breakword}>{value}</div>
    </div>
  );
};

export default DetailLine;
