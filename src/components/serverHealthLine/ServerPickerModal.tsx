import React, { useContext, useEffect, useState } from "react";
import Modal from "react-modal";
import cstyles from "../common/Common.module.css";
import styles from "./ServerHealthLine.module.css";
import { ContextApp } from "../../context/ContextAppState";
import { ServerChainNameEnum, ServerClass, ServerSelectionEnum } from "../appstate";
import fetchServerList from "../../utils/fetchServerList";
import selectFastestServer, { RACE_CANDIDATES } from "../../utils/selectFastestServer";
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
  const { switchServer, delegateServerChoice } = useContext(ContextApp);
  const [servers, setServers] = useState<ServerClass[]>([]);
  // The race takes as long as the probes take, so the button says it is busy
  // and cannot be pressed into starting a second one.
  const [racing, setRacing] = useState(false);

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
      switchServer(uri, ServerSelectionEnum.list);
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
        {/* Automatic, from the place picking by hand happens. Without it the
            only route back was the wallet settings screen, which is a long way
            to go to stop making a decision.

            It runs the race a launch runs, rather than taking the head of this
            list, and the difference is the whole point. The list is ordered by
            the registry's ping measured from the registry's vantage point,
            which narrows the field and nothing more; the wallet then races the
            best few from where the user actually is, and the winner is often
            not the first row. Taking the head here would land somewhere a
            restart would not, which is the one thing this button must not do.

            Offered whether or not the wallet is already on auto: pressing it
            there asks to be raced again, from here and now, which is a real
            request rather than a no-op.

            When the winner is the server already in use there is nothing to
            move to, so only the mode is recorded — moving would reopen the
            wallet against the server it is already on. */}
        {servers.length > 0 && (
          <div className={cstyles.buttoncontainer}>
            <button
              type="button"
              className={cstyles.primarybutton}
              disabled={racing}
              onClick={async () => {
                setRacing(true);
                const candidates = servers.slice(0, RACE_CANDIDATES);
                const quickest = await selectFastestServer(candidates);
                const target = quickest ? quickest.uri : candidates[0].uri;
                setRacing(false);
                if (target === currentUri) delegateServerChoice();
                else switchServer(target, ServerSelectionEnum.auto);
                closeModal();
              }}
            >
              {racing ? "Choosing..." : "Auto"}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ServerPickerModal;
