import Modal from "react-modal";
import React, { useContext, useEffect, useState } from "react";
import cstyles from "../common/Common.module.css";
import Utils from "../../utils/utils";
import { ContextApp } from "../../context/ContextAppState";
import { Server } from "../appstate";
import serverUris from "../../utils/serverUris";
const { ipcRenderer } = window.require("electron");

type ModalProps = {
  closeModal: () => void;
  openErrorModal: (title: string, body: string) => void;
};

export default function ServerSelectModal({ closeModal, openErrorModal }: ModalProps) {
  const context = useContext(ContextApp);
  const { serverSelectState, serverUris: serverUrisContext } = context;
  const { modalIsOpen } = serverSelectState;
  const [selectedServer, setSelectedServer] = useState<string>("");
  const [selectedChain, setSelectedChain] = useState<'main' | 'test' | 'regtest' | '' | 'custom' | 'auto'>("");
  const [autoServer, setAutoServer] = useState<string>("");
  const [customServer, setCustomServer] = useState<string>("");
  const [server, setServer] = useState<string>("");
  const [autoChain, setAutoChain] = useState<'main' | 'test' | 'regtest' | ''>("");
  const [customChain, setCustomChain] = useState<'main' | 'test' | 'regtest' | ''>("");
  const [chain, setChain] = useState<'main' | 'test' | 'regtest' | ''>("");

  const servers: Server[] = serverUris();

  const chains = {
    "main": "Mainnet",
    "test": "Testnet",
    "regtest": "Regtest"
  };

  const initialServerValue = (server: string, chain: 'main' | 'test' | 'regtest' | '') => {
    // not custom
    if (server === Utils.ZCASH_COMMUNITY || server === Utils.V3_LIGHTWALLETD) {
      setSelectedServer(server);
      setCustomServer("");
      setChain(chain);
      setCustomChain('');
    } else {
      setSelectedServer("custom");
      setCustomServer(server);
      setSelectedChain("custom");
      setCustomChain(chain)
    }
  };

  useEffect(() => {
    (async () => {
      const settings = await ipcRenderer.invoke("loadSettings");
      console.log(settings);
      const currServer: string = settings?.serveruri || Utils.ZCASH_COMMUNITY; 
      const currChain: 'main' | 'test' | 'regtest' | '' = settings?.serverchain_name || "main";
      initialServerValue(currServer, currChain);
      setServer(currServer);
      setChain(currChain);
    })();
  }, []);

  const switchServer = async () => {
    let serveruri: string = selectedServer;
    if (serveruri === "custom") {
      serveruri = customServer;
    }
    let serverchain_name: 'main' | 'test' | 'regtest' | '' | 'custom' | 'auto' = selectedChain;
    if (serverchain_name === 'custom') {
      serverchain_name = customChain;
    }

    const settingsb = await ipcRenderer.invoke("loadSettings");
    console.log('before', serveruri, serverchain_name, settingsb);

    await ipcRenderer.invoke("saveSettings", { key: "serveruri", value: serveruri });
    await ipcRenderer.invoke("saveSettings", { key: "serverchain_name", value: serverchain_name });

    const settingsa = await ipcRenderer.invoke("loadSettings");
    console.log('after', serveruri, serverchain_name, settingsa);

    localCloseModal(serveruri, serverchain_name);

    setTimeout(() => {
      openErrorModal("Restart Zingo PC", "Please restart Zingo PC to connect to the new server");
    }, 10);
  };

  const localCloseModal = (server: string, chain: 'main' | 'test' | 'regtest' | '') => {
    initialServerValue(server, chain);
    closeModal();
  };

  console.log(serverUrisContext);

  return (
    <Modal
      isOpen={modalIsOpen}
      onRequestClose={() => localCloseModal(server, chain)}
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
              checked={selectedSelection === 'list'} 
              type="radio" 
              name="server" 
              value={'list'} 
              onClick={(e) => {
                setSelectedSelection('list');
              }} 
              onChange={(e) => {
                setSelectedSelection('list');
              }}>
                <select
                  disabled={selectedChain !== "custom"}
                  className={cstyles.inputbox}
                  style={{ marginLeft: "20px" }}
                  value={customChain}
                  onChange={(e) => setCustomChain(e.target.value as 'main' | 'test' | 'regtest' | '')}
                >
                  <option key="" value=""></option>
                  {servers.map((s: Server) => (
                    <option key={s.uri} value={s.uri}>{s.uri + ' - ' + chains[s.chain_name] + ' - ' + s.region + ' _ ' + s.latency ? s.latency + ' ms.' : ''}</option>
                  ))}
                </select>
              </input>
          </div>

          <div style={{ margin: "10px" }}>
            <input 
              checked={selectedServer === "custom"} 
              type="radio" 
              name="server" 
              value="custom" 
              onClick={(e) => {
                setSelectedServer(e.currentTarget.value);
                setSelectedChain(e.currentTarget.value as 'custom');
              }} 
              onChange={(e) => {
                setSelectedServer(e.currentTarget.value);
                setSelectedChain(e.currentTarget.value as 'custom');
              }} 
            />
            Custom
            <div className={[cstyles.well, cstyles.horizontalflex].join(" ")}>
              <div style={{ width: '80%', padding: 0, margin: 0 }}>
                <input
                  disabled={selectedServer !== "custom"}
                  type="text"
                  className={cstyles.inputbox} 
                  style={{ marginLeft: "20px", width: '80%' }}
                  value={customServer}
                  onChange={(e) => setCustomServer(e.target.value)}
                />
              </div>
              <div style={{ width: '20%', padding: 0, margin: 0 }}>
                <select
                  disabled={selectedChain !== "custom"}
                  className={cstyles.inputbox}
                  style={{ marginLeft: "20px" }}
                  value={customChain}
                  onChange={(e) => setCustomChain(e.target.value as 'main' | 'test' | 'regtest' | '')}
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
            disabled={(selectedServer === "custom" && customServer === "") || (selectedChain === "custom" && customChain === "")}
          >
            Switch Server
          </button>
          <button type="button" className={cstyles.primarybutton} onClick={() => localCloseModal(server, chain)}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
