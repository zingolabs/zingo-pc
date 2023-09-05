import React, { Component } from "react";
import cstyles from "../common/Common.module.css";
import styles from "./Zcashd.module.css";
import ScrollPane from "../scrollPane/ScrollPane";
import Heart from "../../assets/img/zcashdlogo.gif";
import DetailLine from "./components/DetailLine"; 
import { ContextApp } from "../../context/ContextAppState";

type ZcashdProps = {
  refresh: () => void;
  openServerSelectModal: () => void;
};

const chains = {
  "main": "Mainnet",
  "test": "Testnet",
  "regtest": "Regtest"
};

export default class Zcashd extends Component<ZcashdProps> {
  static contextType = ContextApp;
  render() {
    const { refresh, openServerSelectModal } = this.props;
    const { info, rpcConfig } = this.context;
    const { url, chain }: {url: string, chain: 'main' | 'test' | 'regtest'} = rpcConfig;

    if (!info || !info.latestBlock) {
      return (
        <div>
          <div className={[cstyles.verticalflex, cstyles.center].join(" ")}>
            <div style={{ marginTop: "100px" }}>
              <i className={["fas", "fa-times-circle"].join(" ")} style={{ fontSize: "96px", color: "red" }} />
            </div>
            <div className={cstyles.margintoplarge}>Not Connected</div>
          </div>
        </div>
      );
    } else {
      return (
        <div>
          <div className={styles.container}>
            <ScrollPane offsetHeight={0}>
              <div className={styles.imgcontainer}>
                <img src={Heart} alt="heart" />
              </div>

              <div className={styles.detailcontainer}>
                <div className={styles.detaillines}>
                  <DetailLine label="Version" value={info.version} />
                  <DetailLine label="Zingolib Version" value={info.zingolib} />
                  <DetailLine label="Node" value={info.zcashdVersion} />
                  <DetailLine label="Lightwallet Server URI" value={url} />
                  <DetailLine label="Chain Name" value={chains[chain]} />
                  <DetailLine label="Server Network" value={info.testnet ? "Testnet" : "Mainnet"} />
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
            </ScrollPane>
          </div>
        </div>
      );
    }
  }
}
