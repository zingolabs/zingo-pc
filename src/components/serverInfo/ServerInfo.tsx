import React, { useContext } from "react";
import cstyles from "../common/Common.module.css";
import styles from "./ServerInfo.module.css";
import ScrollPaneTop from "../scrollPane/ScrollPane";
import Heart from "../../assets/img/zcashdlogo.gif";
import DetailLine from "./components/DetailLine"; 
import { ContextApp } from "../../context/ContextAppState";
import Utils from "../../utils/utils";

type ServerInfoProps = {
  refresh: () => void;
  openServerSelectModal: () => void;
};

const chains = {
  "main": "Mainnet",
  "test": "Testnet",
  "regtest": "Regtest",
  "": "" 
}; 

const ServerInfo: React.FC<ServerInfoProps> = ({ refresh, openServerSelectModal }) => {
  const context = useContext(ContextApp);
  const { info, serverUri, serverChainName } = context;

  if (!info || !info.latestBlock) {
    return (
      <div>
        <div className={[cstyles.verticalflex, cstyles.center].join(" ")}>
          <div style={{ marginTop: "100px" }}>
            <i className={["fas", "fa-times-circle"].join(" ")} style={{ fontSize: "96px", color: Utils.getCssVariable('--color-error') }} />
          </div>
          <div className={cstyles.margintoplarge}>Not Connected</div>
        </div>
      </div>
    );
  } else {
    return (
      <div>
        <div className={styles.container}>
          <ScrollPaneTop offsetHeight={0}>
            <div className={styles.imgcontainer}>
              <img src={Heart} alt="heart" />
            </div>

            <div className={styles.detailcontainer}>
              <div className={styles.detaillines}>
                <DetailLine label="Version" value={info.version} />
                <DetailLine label="Zingolib Version" value={info.zingolib} />
                <DetailLine label="Node" value={info.zcashdVersion} />
                <DetailLine label="Server URI" value={serverUri} />
                <DetailLine label="Chain Name" value={serverChainName ? chains[serverChainName] : ''} />
                <DetailLine label="Server Network" value={chains[info.chainName]} />
                <DetailLine label="Block Height" value={`${info.latestBlock}`} />
                <DetailLine label="ZEC Price" value={`USD ${info.zecPrice.toFixed(2)}`} />
              </div>
            </div>

            <div className={cstyles.buttoncontainer}>
              <button className={cstyles.primarybutton} type="button" onClick={openServerSelectModal}>
                Switch to Another Server
              </button>
              <button className={cstyles.primarybutton} type="button" onClick={refresh}>
                Refresh All Data
              </button>
            </div>

            <div className={cstyles.margintoplarge} />
          </ScrollPaneTop>
        </div>
      </div>
    );
  }
};

export default ServerInfo;
