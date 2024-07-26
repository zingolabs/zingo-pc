import Modal from "react-modal";
import React, { useCallback, useContext, useEffect, useState } from "react";
import cstyles from "../common/Common.module.css";
import { ContextApp } from "../../context/ContextAppState";
import { Server } from "../appstate";
import serverUrisList from "../../utils/serverUrisList";
const { ipcRenderer } = window.require("electron");

type ModalProps = {
  closeModal: () => void;
  openErrorModal: (title: string, body: string) => void;
};

export default function ServerSelectModal({ closeModal, openErrorModal }: ModalProps) {
  const context = useContext(ContextApp);
  const { serverSelectState, serverUris } = context;
  const { modalIsOpen } = serverSelectState;

  const [selectedServer, setSelectedServer] = useState<string>("");
  const [selectedChain, setSelectedChain] = useState<'main' | 'test' | 'regtest' | ''>("");
  const [selectedSelection, setSelectedSelection] = useState<'auto' | 'list' | 'custom' | ''>("");

  const [autoServer, setAutoServer] = useState<string>("");
  const [customServer, setCustomServer] = useState<string>("");
  const [listServer, setListServer] = useState<string>("");
  
  //const [autoChain, setAutoChain] = useState<'main' | 'test' | 'regtest' | ''>("");
  const [customChain, setCustomChain] = useState<'main' | 'test' | 'regtest' | ''>("");
  //const [listChain, setListChain] = useState<'main' | 'test' | 'regtest' | ''>("");

  const [servers, setServers] = useState<Server[]>(serverUris.length > 0 ? serverUris : serverUrisList().filter((s: Server) => s.obsolete === false));

  const chains = {
    "main": "Mainnet",
    "test": "Testnet",
    "regtest": "Regtest",
    "": ""
  };

  const initialServerValue = useCallback((servers: Server[], server: string, chain: 'main' | 'test' | 'regtest' | '', selection: 'auto' | 'list' | 'custom' | '') => {
    if (selection === 'custom') {
      setCustomServer(server);
      setCustomChain(chain);

      setListServer("");
      //setListChain("");

      setAutoServer(servers[0].uri);
      //setAutoChain("");
    } else if (selection === 'auto') {
      setAutoServer(server);
      //setAutoChain(chain);

      setListServer("");
      //setListChain("");

      setCustomServer("");
      setCustomChain("");
    } else { // list
      setListServer(server);
      //setListChain(chain);

      setCustomServer("");
      setCustomChain("");

      setAutoServer(servers[0].uri);
      //setAutoChain("");
    }
  }, []);

  useEffect(() => {
    (async () => {
      const servers: Server[] = serverUris.length > 0 ? serverUris : serverUrisList().filter((s: Server) => s.obsolete === false);
      const settings = await ipcRenderer.invoke("loadSettings");
      //console.log('modal server settings', settings);

      const currServer: string = settings?.serveruri || servers[0].uri; 
      const currChain: 'main' | 'test' | 'regtest' = settings?.serverchain_name || "main";
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
    const serverchain_name: 'main' | 'test' | 'regtest' | '' = selectedChain;
    const serverselection: 'auto' | 'list' | 'custom' | '' = selectedSelection;

    //const settingsb = await ipcRenderer.invoke("loadSettings");
    //console.log('before', settingsb.serveruri, settingsb.serverchain_name, settingsb.serverselection, settingsb);

    await ipcRenderer.invoke("saveSettings", { key: "serveruri", value: serveruri });
    await ipcRenderer.invoke("saveSettings", { key: "serverchain_name", value: serverchain_name });
    await ipcRenderer.invoke("saveSettings", { key: "serverselection", value: serverselection });

    //const settingsa = await ipcRenderer.invoke("loadSettings");
    //console.log('after', settingsa.serveruri, settingsa.serverchain_name, settingsa.serverselection, settingsa);

    localCloseModal();

    setTimeout(() => {
      openErrorModal("Restart Zingo PC", "Please restart Zingo PC to connect to the new server"); 
    }, 10);
  };

  const localCloseModal = async () => {
    const settings = await ipcRenderer.invoke("loadSettings");
      
    const currServer: string = settings?.serveruri || servers[0].uri; 
    const currChain: 'main' | 'test' | 'regtest' = settings?.serverchain_name || "main";
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
          <div className={cstyles.horizontalflex} style={{ margin: "10px" }}>
            <input
              checked={selectedSelection === 'auto'}
              type="radio" 
              name="selection" 
              value={'auto'}
              onClick={(e) => {
                setSelectedSelection('auto');
                setSelectedServer(autoServer);
                if (!!autoServer) {
                  setSelectedChain(servers.filter((s: Server) => s.uri === autoServer)[0].chain_name);
                }
              }} 
              onChange={(e) => {
                setSelectedSelection('auto');
                setSelectedServer(autoServer);
                if (!!autoServer) {
                  setSelectedChain(servers.filter((s: Server) => s.uri === autoServer)[0].chain_name);
                }
              }}
            />
            Automatic
            {!!autoServer && servers.filter((s: Server) => s.uri === autoServer)[0].latency !== null && selectedSelection === 'auto' && ( 
              <div style={{ margin: "10px"}}>{autoServer + ' - ' + 
                chains[servers.filter((s: Server) => s.uri === autoServer)[0].chain_name] + ' - ' + 
                servers.filter((s: Server) => s.uri === autoServer)[0].region +
                (servers.filter((s: Server) => s.uri === autoServer)[0].latency ? (' _ ' + servers.filter((s: Server) => s.uri === autoServer)[0].latency + ' ms.') : '')}
              </div>
            )}
          </div>

          <div className={cstyles.horizontalflex} style={{ margin: "10px" }}>
            <input
              checked={selectedSelection === 'list'} 
              type="radio" 
              name="selection" 
              value={'list'} 
              onClick={(e) => {
                setSelectedSelection('list');
                setSelectedServer(listServer);
                if (!!listServer) {
                  setSelectedChain(servers.filter((s: Server) => s.uri === listServer)[0].chain_name);
                }
              }} 
              onChange={(e) => {
                setSelectedSelection('list');
                setSelectedServer(listServer);
                if (!!listServer) {
                  setSelectedChain(servers.filter((s: Server) => s.uri === listServer)[0].chain_name);
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
                setSelectedChain(servers.filter((s: Server) => s.uri === e.target.value)[0].chain_name);
              }}>
                <option key="" value=""></option>
                {servers.map((s: Server) => (
                  <option key={s.uri} value={s.uri}>{s.uri + ' - ' + chains[s.chain_name] + ' - ' + s.region + (s.latency ? (' _ ' + s.latency + ' ms.') : '')}</option>
                ))}
            </select>
          </div>

          <div style={{ margin: "10px" }}>
            <input 
              checked={selectedSelection === "custom"} 
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
              <div style={{ width: '80%', padding: 0, margin: 0 }}>
                <input
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
              <div style={{ width: '20%', padding: 0, margin: 0 }}>
                <select
                  disabled={selectedSelection !== "custom"}
                  className={cstyles.inputbox}
                  style={{ marginLeft: "20px" }}
                  value={customChain}
                  onChange={(e) => {
                    setCustomChain(e.target.value as 'main' | 'test' | 'regtest' | '');
                    setSelectedChain(e.target.value as 'main' | 'test' | 'regtest' | '');
                  }}
                >
                  <option value=""></option> 
                  <option value="main">{chains["main"]}</option>
                  <option value="test">{chains["test"]}</option>
                  <option value="regtest">{chains['regtest']}</option> 
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
