import Modal from "react-modal";
import React, { useCallback, useContext, useEffect, useState } from "react";
import cstyles from "../common/Common.module.css";
import { ContextApp } from "../../context/ContextAppState";
import { ServerClass } from "../appstate";
import serverUrisList from "../../utils/serverUrisList";
import { ServerChainNameEnum } from "../appstate/enums/ServerChainNameEnum";
import Utils from "../../utils/utils";
const { ipcRenderer } = window.require("electron");

type SelectSelectModalProps = {
  closeModal: () => void;
};

const SelectSelectModal: React.FC<SelectSelectModalProps> = ({ closeModal }) => {
  const context = useContext(ContextApp);
  const { serverSelectModal, serverUris, openErrorModal } = context;
  const { modalIsOpen } = serverSelectModal;

  const [selectedServer, setSelectedServer] = useState<string>("");
  const [selectedChain, setSelectedChain] = useState<ServerChainNameEnum | ''>("");
  const [selectedSelection, setSelectedSelection] = useState<'auto' | 'list' | 'custom' | ''>("");

  const [autoServer, setAutoServer] = useState<string>("");
  const [customServer, setCustomServer] = useState<string>("");
  const [listServer, setListServer] = useState<string>("");
  
  const [customChain, setCustomChain] = useState<ServerChainNameEnum | ''>("");

  const [servers, setServers] = useState<ServerClass[]>(serverUris.length > 0 ? serverUris : serverUrisList().filter((s: ServerClass) => s.obsolete === false));

  const chains = {
    "main": "Mainnet",
    "test": "Testnet",
    "regtest": "Regtest",
    "": ""
  };

  const initialServerValue = useCallback((servers: ServerClass[], server: string, chain_name: ServerChainNameEnum | '', selection: 'auto' | 'list' | 'custom' | '') => {
    if (selection === 'custom') {
      setCustomServer(server);
      setCustomChain(chain_name);

      setListServer("");

      setAutoServer(servers[0].uri);
    } else if (selection === 'auto') {
      setAutoServer(server);

      setListServer("");

      setCustomServer("");
      setCustomChain("");
    } else { // list
      setListServer(server);

      setCustomServer("");
      setCustomChain("");

      setAutoServer(servers[0].uri);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const servers: ServerClass[] = serverUris.length > 0 ? serverUris : serverUrisList().filter((s: ServerClass) => s.obsolete === false);
      const settings = await ipcRenderer.invoke("loadSettings");
      console.log('modal server settings', settings);

      const currServer: string = settings?.serveruri || servers[0].uri; 
      const currChain: ServerChainNameEnum = settings?.serverchain_name || ServerChainNameEnum.mainChainName;
      const currSelection: 'auto' | 'list' | 'custom' = settings?.serverselection || 'list'
      initialServerValue(servers, currServer, currChain, currSelection);
      setSelectedServer(currServer);
      setSelectedChain(currChain);
      setSelectedSelection(currSelection);
      setServers(servers);
    })();
  }, [initialServerValue, serverUris]);

  const switchServer = async () => {
    const serveruri: string = selectedServer;
    const serverchain_name: ServerChainNameEnum | '' = selectedChain;
    const serverselection: 'auto' | 'list' | 'custom' | '' = selectedSelection;

    await ipcRenderer.invoke("saveSettings", { key: "serveruri", value: serveruri });
    await ipcRenderer.invoke("saveSettings", { key: "serverchain_name", value: serverchain_name });
    await ipcRenderer.invoke("saveSettings", { key: "serverselection", value: serverselection });

    localCloseModal();

    setTimeout(() => {
      openErrorModal("Restart Zingo PC", "Zingo PC is going to restart in 5 seconds to connect to the new server"); 
    }, 10);
    setTimeout(() => {
      ipcRenderer.send("apprestart");
    }, 5000);
  };

  const localCloseModal = async () => {
    const settings = await ipcRenderer.invoke("loadSettings");
      
    const currServer: string = settings?.serveruri || servers[0].uri; 
    const currChain: ServerChainNameEnum = settings?.serverchain_name || ServerChainNameEnum.mainChainName;
    const currSelection: 'auto' | 'list' | 'custom' = settings?.serverselection || 'list'
    initialServerValue(servers, currServer, currChain, currSelection);
    setSelectedServer(currServer);
    setSelectedChain(currChain);
    setSelectedSelection(currSelection);
    closeModal();
  };

  //console.log('render modal server', servers, selectedServer, selectedChain, selectedSelection);

  return (
    <Modal
      isOpen={modalIsOpen}
      onRequestClose={() => localCloseModal()}
      className={cstyles.modal}
      overlayClassName={cstyles.modalOverlay}
    >
      <div className={[cstyles.verticalflex].join(" ")}>
        <div className={cstyles.marginbottomlarge} style={{ textAlign: "left", marginLeft: 10 }}>
          Switch to Another Server
        </div>

        <div className={[cstyles.well, cstyles.verticalflex].join(" ")}>
          <div className={cstyles.horizontalflex} style={{ margin: "10px", alignItems:'center' }}>
            <input
              checked={selectedSelection === 'auto'}
              style={{ accentColor: Utils.getCssVariable('--color-primary') }}
              type="radio" 
              name="selection" 
              value={'auto'}
              onClick={(e) => {
                setSelectedSelection('auto');
                setSelectedServer(autoServer);
                if (!!autoServer) {
                  setSelectedChain(servers.filter((s: ServerClass) => s.uri === autoServer)[0].chain_name);
                }
              }} 
              onChange={(e) => {
                setSelectedSelection('auto');
                setSelectedServer(autoServer);
                if (!!autoServer) {
                  setSelectedChain(servers.filter((s: ServerClass) => s.uri === autoServer)[0].chain_name);
                }
              }}
            />
            Automatic
            {!!autoServer && servers.filter((s: ServerClass) => s.uri === autoServer)[0].latency !== null && selectedSelection === 'auto' && ( 
              <div style={{ margin: "10px"}}>{autoServer + ' - ' + 
                chains[servers.filter((s: ServerClass) => s.uri === autoServer)[0].chain_name] + ' - ' + 
                servers.filter((s: ServerClass) => s.uri === autoServer)[0].region +
                (servers.filter((s: ServerClass) => s.uri === autoServer)[0].latency ? (' _ ' + servers.filter((s: ServerClass) => s.uri === autoServer)[0].latency + ' ms.') : '')}
              </div>
            )}
          </div>

          <div className={cstyles.horizontalflex} style={{ margin: "10px", alignItems: 'center' }}>
            <input
              checked={selectedSelection === 'list'}
              style={{ accentColor: Utils.getCssVariable('--color-primary') }}
              type="radio" 
              name="selection" 
              value={'list'} 
              onClick={(e) => {
                setSelectedSelection('list');
                setSelectedServer(listServer);
                if (!!listServer) {
                  setSelectedChain(servers.filter((s: ServerClass) => s.uri === listServer)[0].chain_name);
                }
              }} 
              onChange={(e) => {
                setSelectedSelection('list');
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
                setSelectedSelection('custom');
                setSelectedServer(customServer);
                setSelectedChain(customChain);
              }} 
              onChange={(e) => {
                setSelectedSelection('custom');
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
    </Modal>
  );
}

export default SelectSelectModal;