import React, { useContext, useEffect, useState } from "react";
import Modal from "react-modal";
import cstyles from "../common/Common.module.css";
import styles from "./ServerHealthLine.module.css";
import { ContextApp } from "../../context/ContextAppState";
import { ServerChainNameEnum, ServerClass, ServerSelectionEnum } from "../appstate";
import fetchServerList from "../../utils/fetchServerList";
import serverUrisList from "../../utils/serverUrisList";
import Utils from "../../utils/utils";

type ServerPickerModalProps = {
  modalIsOpen: boolean;
  closeModal: () => void;
  chainName: ServerChainNameEnum;
  currentUri: string;
};

/**
 * The same server list the wallet settings screen offers, reachable from the
 * health line in one click.
 *
 * A `list` wallet is already saying "pick for me from the servers you publish",
 * so sending the user through the settings screen to do exactly that was a
 * detour. Only servers on this wallet's chain are offered: a wallet cannot
 * follow its server onto a different one.
 */
const ServerPickerModal: React.FC<ServerPickerModalProps> = ({ modalIsOpen, closeModal, chainName, currentUri }) => {
  const { switchServer, delegateServerChoice, currentWallet } = useContext(ContextApp);
  const [servers, setServers] = useState<ServerClass[]>([]);

  // Fetched when the modal opens rather than on mount, so a line that is never
  // clicked never asks the registry anything.
  useEffect(() => {
    if (!modalIsOpen) {
      return;
    }
    let dropped = false;
    (async () => {
      const live: ServerClass[] = await fetchServerList(chainName);
      if (dropped) {
        return;
      }
      setServers(
        live.length > 0 ? live : serverUrisList().filter((s: ServerClass) => !s.obsolete && s.chain_name === chainName),
      );
    })();
    return () => {
      dropped = true;
    };
  }, [modalIsOpen, chainName]);

  const choose = (uri: string) => {
    closeModal();
    if (uri !== currentUri) {
      switchServer(uri);
    }
  };

  return (
    <Modal
      isOpen={modalIsOpen}
      onRequestClose={closeModal}
      className={`${cstyles.modal} ${styles.pickermodal}`}
      overlayClassName={cstyles.modalOverlay}
    >
      <div className={styles.pickertitle}>{`Choose a ${Utils.chainDisplayName(chainName)} server`}</div>

      {/* The list is the only part allowed to grow, so however many servers the
          registry returns, Cancel stays on screen. */}
      <div className={`${cstyles.well} ${styles.serverlist}`}>
        {servers.length === 0 && <div className={cstyles.sublight}>No servers available for this network.</div>}
        {servers.map((s: ServerClass) => (
          <button
            key={s.uri}
            type="button"
            className={styles.serveroption}
            disabled={s.uri === currentUri}
            onClick={() => choose(s.uri)}
          >
            {/* Same shape as the wallet settings picker, so the two read alike. */}
            <span>
              {s.uri + " - " + Utils.chainDisplayName(s.chain_name) + (s.latency ? " _ " + s.latency + " ms." : "")}
            </span>
            {s.uri === currentUri && <span className={styles.badge}>current</span>}
          </button>
        ))}
      </div>

      <div className={styles.pickerfooter}>
        <div className={cstyles.buttoncontainer}>
          <button type="button" className={cstyles.primarybutton} onClick={closeModal}>
            Cancel
          </button>
        </div>
        {/* The way out of picking by hand, in the place picking by hand
            happens. Without it the only route back to automatic was the
            wallet settings screen, which is a long way to go to stop making a
            decision.

            Not offered to a wallet already on auto — the picker is reachable
            from there now, and a button that would change nothing reads as
            one that failed. */}
        {currentWallet && currentWallet.selection !== ServerSelectionEnum.auto && (
          <div className={cstyles.buttoncontainer}>
            <button
              type="button"
              className={cstyles.primarybutton}
              onClick={() => {
                delegateServerChoice();
                closeModal();
              }}
            >
              Auto
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ServerPickerModal;
