import Modal from "react-modal";
import React, { useEffect, useState } from "react";
import cstyles from "../common/Common.module.css";
import Utils from "../../utils/utils";
const { ipcRenderer } = window.require("electron");

type ModalProps = {
  modalIsOpen: boolean;
  closeModal: () => void;
  openErrorModal: (title: string, body: string) => void;
};

export default function ServerSelectModal({ modalIsOpen, closeModal, openErrorModal }: ModalProps) {
  const [selected, setSelected] = useState("");
  const [custom, setCustom] = useState("");

  const servers = [
    { name: "Zcash Community (Default)", uri: Utils.ZCASH_COMMUNITY},
  ];

  useEffect(() => {
    (async () => {
      const settings = await ipcRenderer.invoke("loadSettings");
      const server = settings?.serveruri || "";
      // not custom
      if (server === Utils.ZCASH_COMMUNITY) {
        setSelected(server);
      } else {
        setSelected("custom");
        setCustom(server);
      }
    })();
  }, []);

  const switchServer = () => {
    let serveruri = selected;
    if (serveruri === "custom") {
      serveruri = custom;
    }

    ipcRenderer.invoke("saveSettings", { key: "serveruri", value: serveruri });

    closeModal();

    setTimeout(() => {
      openErrorModal("Restart Zingo PC", "Please restart Zingo PC to connect to the new server");
    }, 10);
  };

  return (
    <Modal
      isOpen={modalIsOpen}
      onRequestClose={closeModal}
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
          <button type="button" className={cstyles.primarybutton} onClick={closeModal}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
