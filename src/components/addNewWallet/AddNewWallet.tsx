import React, { useCallback, useContext, useEffect, useState } from "react";
import cstyles from "../common/Common.module.css";
import styles from "./AddNewWallet.module.css";
import { ContextApp } from "../../context/ContextAppState";
import { ServerClass, ServerSelectionEnum } from "../appstate";
import serverUrisList from "../../utils/serverUrisList";
import { ServerChainNameEnum } from "../appstate/enums/ServerChainNameEnum";
import Utils from "../../utils/utils";
const { ipcRenderer } = window.require("electron");

type AddNewWalletProps = {
  closeModal: () => void;
};

const AddNewWallet: React.FC<AddNewWalletProps> = ({ closeModal }) => {
  const context = useContext(ContextApp);
  const { serverUris, openErrorModal, currentWallet } = context;

  const [selectedServer, setSelectedServer] = useState<string>("");
  const [selectedChain, setSelectedChain] = useState<ServerChainNameEnum | ''>("");
  const [selectedSelection, setSelectedSelection] = useState<ServerSelectionEnum | ''>("");

  const [autoServer, setAutoServer] = useState<string>("");
  const [customServer, setCustomServer] = useState<string>("");
  const [listServer, setListServer] = useState<string>("");
  
  const [customChain, setCustomChain] = useState<ServerChainNameEnum | ''>("");
  const [autoChain, setAutoChain] = useState<ServerChainNameEnum | ''>("");

  const [servers, setServers] = useState<ServerClass[]>(serverUris.length > 0 ? serverUris : serverUrisList().filter((s: ServerClass) => s.obsolete === false));

  const chains = {
    "main": "Mainnet",
    "test": "Testnet",
    "regtest": "Regtest",
    "": ""
  };

  const initialServerValue = useCallback((server: string, chain_name: ServerChainNameEnum | '', selection: ServerSelectionEnum | '') => {
    if (selection === ServerSelectionEnum.custom) {
      setCustomServer(server);
      setCustomChain(chain_name);

      setListServer("");

      setAutoServer(server);
      // if the user have a custom server
      // pre-fill with the server's chain only for:
      // - MainNet
      // - TestNet
      // make no sense to select automatically for RegTest (no list)
      if (chain_name === ServerChainNameEnum.mainChainName || chain_name === ServerChainNameEnum.testChainName) {
        setAutoChain(chain_name);
      } else {
        // for RegTest -> TestNet.
        setAutoChain(ServerChainNameEnum.testChainName);
      }
    } else if (selection === ServerSelectionEnum.auto) {
      setAutoServer(server);
      setAutoChain(chain_name);

      setListServer("");

      setCustomServer("");
      setCustomChain("");
    } else { // list
      setListServer(server);

      setCustomServer("");
      setCustomChain("");

      setAutoServer(server);
      setAutoChain(chain_name);
    }
  }, []);

  useEffect(() => {
    const currServer: string = currentWallet ? currentWallet.uri : ''; 
    const currChain: ServerChainNameEnum = currentWallet ? currentWallet.chain_name : ServerChainNameEnum.mainChainName;
    const currSelection: ServerSelectionEnum = currentWallet ? currentWallet.selection : ServerSelectionEnum.list;
    initialServerValue(currServer, currChain, currSelection);
    setSelectedServer(currServer);
    setSelectedChain(currChain);
    setSelectedSelection(currSelection);
    setServers(servers);
  }, [initialServerValue, currentWallet?.chain_name, currentWallet?.selection, currentWallet?.uri, serverUris, currentWallet, servers]);

  const switchServer = async () => {
    await ipcRenderer.invoke("saveSettings", { key: "serveruri", value: selectedServer });
    await ipcRenderer.invoke("saveSettings", { key: "serverchain_name", value: selectedChain });
    await ipcRenderer.invoke("saveSettings", { key: "serverselection", value: selectedSelection });
    // reset the current wallet Id.
    // only if the Network/Chain changed.
    //if (serverChainName !== selectedChain) {
    //  await ipcRenderer.invoke("saveSettings", { key: "currentwalletid", value: null });
    //}

    setTimeout(() => {
      openErrorModal("Restart Zingo PC", "Zingo PC is going to restart in 5 seconds to connect to the new server/wallet"); 
    }, 10);
    setTimeout(() => {
      ipcRenderer.send("apprestart");
    }, 5000);
  };

  const localCloseModal = async () => {
    const currServer: string = currentWallet ? currentWallet.uri : ''; 
    const currChain: ServerChainNameEnum = currentWallet ? currentWallet.chain_name : ServerChainNameEnum.mainChainName;
    const currSelection: ServerSelectionEnum = currentWallet ? currentWallet.selection : ServerSelectionEnum.list;
    initialServerValue(currServer, currChain, currSelection);
    setSelectedServer(currServer);
    setSelectedChain(currChain);
    setSelectedSelection(currSelection);
    closeModal();
  };

  //console.log('render modal server', servers, selectedServer, selectedChain, selectedSelection);

  return (
    <div>
      <div className={[cstyles.xlarge, cstyles.margintoplarge, cstyles.center].join(" ")}>Add a New Wallet</div>

      <div className={styles.addnewwalletcontainer}>
        <div className={[cstyles.well, cstyles.verticalflex].join(" ")}>
          <div className={cstyles.horizontalflex} style={{ margin: "10px", alignItems:'center' }}>
            <input
              checked={selectedSelection === ServerSelectionEnum.auto}
              style={{ accentColor: Utils.getCssVariable('--color-primary') }}
              type="radio" 
              name="selection" 
              value={ServerSelectionEnum.auto}
              onClick={(e) => {
                setSelectedSelection(ServerSelectionEnum.auto);
                setSelectedServer(autoServer);
                setSelectedChain(autoChain);
              }} 
              onChange={(e) => {
                setSelectedSelection(ServerSelectionEnum.auto);
                setSelectedServer(autoServer);
                setSelectedChain(autoChain);
              }}
            />
            Automatic
            <select
              disabled={selectedSelection !== "auto"}
              className={cstyles.inputbox}
              style={{ marginLeft: "20px", color: customChain === '' ? Utils.getCssVariable('--color-zingo') : undefined }}
              value={autoChain}
              onChange={(e) => {
                const value = e.target.value as ServerChainNameEnum | ''; 
                setAutoChain(value);
                setSelectedChain(value);
                setSelectedServer(servers.filter((s: ServerClass) => s.default && s.chain_name === value)[0].uri);
              }}
            > 
              <option value="" disabled hidden>Select...</option> 
              <option value="main">{chains["main"]}</option>
              <option value="test">{chains["test"]}</option>
            </select>
          </div>

          <div className={cstyles.horizontalflex} style={{ margin: "10px", alignItems: 'center' }}>
            <input
              checked={selectedSelection === ServerSelectionEnum.list}
              style={{ accentColor: Utils.getCssVariable('--color-primary') }}
              type="radio" 
              name="selection" 
              value={ServerSelectionEnum.list} 
              onClick={(e) => {
                setSelectedSelection(ServerSelectionEnum.list);
                setSelectedServer(listServer);
                if (!!listServer) {
                  setSelectedChain(servers.filter((s: ServerClass) => s.uri === listServer)[0].chain_name);
                }
              }} 
              onChange={(e) => {
                setSelectedSelection(ServerSelectionEnum.list);
                setSelectedServer(listServer);
                if (!!listServer) {
                  setSelectedChain(servers.filter((s: ServerClass) => s.uri === listServer)[0].chain_name);
                }
              }}
            />
            Server
            <select
              disabled={selectedSelection !== "list"}
              className={cstyles.inputbox}
              style={{ marginLeft: "20px" }}
              value={listServer}
              onChange={(e) => {
                setListServer(e.target.value);
                setSelectedServer(e.target.value);
                setSelectedChain(servers.filter((s: ServerClass) => s.uri === e.target.value)[0].chain_name);
              }}>
                <option key="" value="" disabled hidden></option>
                {servers.map((s: ServerClass) => (
                  <option key={s.uri} value={s.uri}>{s.uri + ' - ' + chains[s.chain_name] + ' - ' + s.region + (s.latency ? (' _ ' + s.latency + ' ms.') : '')}</option>
                ))}
            </select>
          </div>

          <div style={{ margin: "10px" }}>
            <input 
              checked={selectedSelection === "custom"}
              style={{ accentColor: Utils.getCssVariable('--color-primary') }}
              type="radio" 
              name="selection" 
              value={"custom"} 
              onClick={(e) => {
                setSelectedSelection(ServerSelectionEnum.custom);
                setSelectedServer(customServer);
                setSelectedChain(customChain);
              }} 
              onChange={(e) => {
                setSelectedSelection(ServerSelectionEnum.custom);
                setSelectedServer(customServer);
                setSelectedChain(customChain);
              }} 
            />
            Custom
            <div className={[cstyles.well, cstyles.horizontalflex].join(" ")}>
              <div style={{ width: '75%', padding: 0, margin: 0, flexWrap: 'nowrap' }}>
                URI 
                <input
                  placeholder="https://------.---:---"
                  disabled={selectedSelection !== "custom"}
                  type="text"
                  className={cstyles.inputbox} 
                  style={{ marginLeft: "20px", width: '80%' }}
                  value={customServer}
                  onChange={(e) => {
                    setCustomServer(e.target.value);
                    setSelectedServer(e.target.value);
                  }}
                />
              </div>
              <div className={cstyles.horizontalflex} style={{ margin: "10px", alignItems: 'center' }}>
                Network 
                <select
                  disabled={selectedSelection !== "custom"}
                  className={cstyles.inputbox}
                  style={{ marginLeft: "20px", color: customChain === '' ? Utils.getCssVariable('--color-zingo') : undefined }}
                  value={customChain}
                  onChange={(e) => {
                    setCustomChain(e.target.value as ServerChainNameEnum | '');
                    setSelectedChain(e.target.value as ServerChainNameEnum | '');
                  }}
                >
                  <option value="" disabled hidden>Select...</option> 
                  <option value="main">{chains["main"]}</option>
                  <option value="test">{chains["test"]}</option>
                  <option value="regtest">{chains["regtest"]}</option> 
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className={cstyles.buttoncontainer}>
          <button 
            type="button" 
            className={cstyles.primarybutton} 
            onClick={switchServer} 
            disabled={(selectedServer === "custom" && customServer === "") || (selectedSelection === "custom" && customChain === "")}
          >
            Switch Server
          </button>
          <button type="button" className={cstyles.primarybutton} onClick={() => localCloseModal()}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default AddNewWallet;