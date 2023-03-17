import React from "react";
import cstyles from "../../common/Common.module.css";
import styles from "../Zcashd.module.css";

type DetailLineProps = {
  label: string;
  value: string;
};

const DetailLine = ({ label, value }: DetailLineProps) => {
  return (
    <div className={styles.detailline}>
      <div className={[cstyles.sublight].join(" ")}>{label} :</div>
      <div className={cstyles.breakword}>{value}</div>
    </div>
  );
};

export default DetailLine;