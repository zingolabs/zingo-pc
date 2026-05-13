import React from "react";
import cstyles from "../components/common/Common.module.css";
import { BlockExplorerEnum, ServerChainNameEnum } from "../components/appstate";
import Utils from "../utils/utils";

type ShieldResultContentProps = {
  txids: string[];
  chainName: ServerChainNameEnum | undefined;
  blockExplorerTransaction: BlockExplorerEnum;
  blockExplorerTransactionCustom: string;
};

const ShieldResultContent: React.FC<ShieldResultContentProps> = ({
  txids,
  chainName,
  blockExplorerTransaction,
  blockExplorerTransactionCustom,
}) => {
  const showExplorer = chainName !== ServerChainNameEnum.regtestChainName;

  return (
    <div style={{ display: "flex", flexDirection: "row", justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          marginRight: 10,
        }}
      >
        <div>{(txids.length === 1 ? "Transaction was" : "Transactions were") + " successfully broadcast."}</div>
        <div>{`TXID: ${txids[0]}`}</div>
        {txids.length > 1 && <div>{`TXID: ${txids[1]}`}</div>}
        {txids.length > 2 && <div>{`TXID: ${txids[2]}`}</div>}
      </div>

      {showExplorer && (
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
          {txids.slice(0, 3).map((txid, i) => (
            <div
              key={txid}
              style={i > 0 ? { marginTop: 5 } : undefined}
              className={cstyles.primarybutton}
              onClick={() => Utils.openTxid(txid, chainName, blockExplorerTransaction, blockExplorerTransactionCustom)}
            >
              View TXID &nbsp;
              <i className={`${"fas"} ${"fa-external-link-square-alt"}`} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ShieldResultContent;
