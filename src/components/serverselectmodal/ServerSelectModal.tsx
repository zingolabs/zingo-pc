import Modal from "react-modal";
import React, { useContext, useEffect, useState } from "react";
import cstyles from "../common/Common.module.css";
import Utils from "../../utils/utils";
import { ContextApp } from "../../context/ContextAppState";
const { ipcRenderer } = window.require("electron");

type ModalProps = {
  closeModal: () => void;
  openErrorModal: (title: string, body: string) => void;
};

export default function ServerSelectModal({ closeModal, openErrorModal }: ModalProps) {
  const context = useContext(ContextApp);
  const { serverSelectState } = context;
  const { modalIsOpen } = serverSelectState;
  const [selectedServer, setSelectedServer] = useState<string>("");
  const [selectedChain, setSelectedChain] = useState<'main' | 'test' | 'regtest' | '' | 'custom'>("");
  const [customServer, setCustomServer] = useState<string>("");
  const [server, setServer] = useState<string>("");
  const [customChain, setCustomChain] = useState<'main' | 'test' | 'regtest' | ''>("");
  const [chain, setChain] = useState<'main' | 'test' | 'regtest' | ''>("");

  const servers: {name: string, uri: string, chain_name: 'main' | 'test' | 'regtest'}[] = [
    { name: "Zcash Community (Default)", uri: Utils.ZCASH_COMMUNITY, chain_name: 'main'},
    { name: "Zec Wallet", uri: Utils.V3_LIGHTWALLETD, chain_name: 'main'},
  ];

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
      const currServer: string = settings?.serveruri || "";
      const currChain: 'main' | 'test' | 'regtest' | '' = settings?.serverchain_name || "";
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
    let serverchain_name: 'main' | 'test' | 'regtest' | '' | 'custom' = selectedChain;
    if (serverchain_name === 'custom') {
      serverchain_name = customChain;
    }

    ipcRenderer.invoke("saveSettings", { key: "serveruri", value: serveruri });
    ipcRenderer.invoke("saveSettings", { key: "serverchain_name", value: serverchain_name });

    localCloseModal(serveruri, serverchain_name);

    setTimeout(() => {
      openErrorModal("Restart Zingo PC", "Please restart Zingo PC to connect to the new server");
    }, 10);
  };

  const localCloseModal = (server: string, chain: 'main' | 'test' | 'regtest' | '') => {
    initialServerValue(server, chain);
    closeModal();
  };

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
          {servers.map((s) => (
            <div style={{ margin: "10px" }} key={s.uri}>
              <input
                checked={selectedServer === s.uri} 
                type="radio" 
                name="server" 
                value={s.uri} 
                onClick={(e) => {
                  setSelectedServer(e.currentTarget.value);
                  setSelectedChain(s.chain_name);
                }} 
                onChange={(e) => {
                  setSelectedServer(e.currentTarget.value);
                  setSelectedChain(s.chain_name);
                }} />
              {`${s.name} - ${s.uri} [${chains[s.chain_name]}]`}
            </div>
          ))}

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
              <div style={{ width: '80%'}}>
                <input
                  type="text"
                  className={cstyles.inputbox} 
                  style={{ marginLeft: "20px", width: '80%' }}
                  value={customServer}
                  onChange={(e) => setCustomServer(e.target.value)}
                />
              </div>
              <div style={{ width: '20%' }}>
                <select
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
          <button type="button" className={cstyles.primarybutton} onClick={switchServer} disabled={selectedServer === "custom" && customServer === "" && customChain === ""}>
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
