import React from "react";
import cstyles from "../../common/Common.module.css";
import { BlockExplorerEnum } from "../../appstate";

export type ExplorerRowProps = {
  label: string;
  ariaLabel: string;
  customPlaceholder: string;
  value: BlockExplorerEnum;
  onChange: (v: BlockExplorerEnum) => void;
  customValue: string;
  onCustomChange: (v: string) => void;
};

const ExplorerRow = ({
  label,
  ariaLabel,
  customPlaceholder,
  value,
  onChange,
  customValue,
  onCustomChange,
}: ExplorerRowProps) => {
  const isCustom = value === BlockExplorerEnum.Custom;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div className={cstyles.small}>{label}</div>
        <select
          aria-label={ariaLabel}
          className={cstyles.inputbox}
          style={{ marginLeft: 16, minWidth: 220 }}
          value={value}
          onChange={(e) => onChange(e.target.value as BlockExplorerEnum)}
        >
          <option value="" disabled hidden>
            Select…
          </option>
          <option value={BlockExplorerEnum.Zcashexplorer}>Zcash Explorer App</option>
          <option value={BlockExplorerEnum.Cipherscan}>Cipher Scan App</option>
          <option value={BlockExplorerEnum.Zypherscan}>Zypher Scan Com</option>
          <option value={BlockExplorerEnum.Custom}>Custom</option>
        </select>
      </div>
      {isCustom && (
        <input
          aria-label={`${ariaLabel} custom URL`}
          type="text"
          className={cstyles.inputbox}
          placeholder={customPlaceholder}
          value={customValue}
          onChange={(e) => onCustomChange(e.target.value)}
          style={{ width: "100%", marginTop: 8 }}
        />
      )}
    </div>
  );
};

export default ExplorerRow;
