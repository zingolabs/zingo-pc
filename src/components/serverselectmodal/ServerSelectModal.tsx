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
  const [selected, setSelected] = useState<string>("");
  const [custom, setCustom] = useState<string>("");
  const [server, setServer] = useState<string>("");

  const servers: {name: string, uri: string}[] = [
    { name: "Zcash Community (Default)", uri: Utils.ZCASH_COMMUNITY},
    { name: "Zec Wallet", uri: Utils.V3_LIGHTWALLETD},
  ];

  const initialServerValue = (server: string) => {
    // not custom
    if (server === Utils.ZCASH_COMMUNITY || server === Utils.V3_LIGHTWALLETD) {
      setSelected(server);
      setCustom("");
    } else {
      setSelected("custom");
      setCustom(server);
    }
  };

  useEffect(() => {
    (async () => {
      const settings = await ipcRenderer.invoke("loadSettings");
      const currServer: string = settings?.serveruri || "";
      initialServerValue(currServer);
      setServer(currServer);
    })();
  }, []);

  const switchServer = async () => {
    let serveruri: string = selected;
    if (serveruri === "custom") {
      serveruri = custom;
    }

    ipcRenderer.invoke("saveSettings", { key: "serveruri", value: serveruri });

    localCloseModal(serveruri);

    setTimeout(() => {
      openErrorModal("Restart Zingo PC", "Please restart Zingo PC to connect to the new server");
    }, 10);
  };

  const localCloseModal = (server: string) => {
    initialServerValue(server);
    closeModal();
  };

  return (
    <Modal
      isOpen={modalIsOpen}
      onRequestClose={() => localCloseModal(server)}
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
              <input checked={selected === s.uri} type="radio" name="server" value={s.uri} onClick={(e) => setSelected(e.currentTarget.value)} onChange={(e) => setSelected(e.currentTarget.value)} />
              {`${s.name} - ${s.uri}`}
            </div>
          ))}

          <div style={{ margin: "10px" }}>
            <input checked={selected === "custom"} type="radio" name="server" value="custom" onClick={(e) => setSelected(e.currentTarget.value)} onChange={(e) => setSelected(e.currentTarget.value)} />
            Custom
            <input
              type="text"
              className={cstyles.inputbox}
              style={{ marginLeft: "20px" }}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
          </div>
        </div>

        <div className={cstyles.buttoncontainer}>
          <button type="button" className={cstyles.primarybutton} onClick={switchServer} disabled={selected === "custom" && custom === ""}>
            Switch Server
          </button>
          <button type="button" className={cstyles.primarybutton} onClick={() => localCloseModal(server)}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
