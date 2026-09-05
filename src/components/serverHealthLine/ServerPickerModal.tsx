import React, { useContext, useEffect, useState } from "react";
import Modal from "react-modal";
import cstyles from "../common/Common.module.css";
import styles from "./ServerHealthLine.module.css";
import { ContextApp } from "../../context/ContextAppState";
import { ServerChainNameEnum, ServerClass, ServerSelectionEnum } from "../appstate";
import fetchServerList from "../../utils/fetchServerList";
import selectFastestServer, { RACE_CANDIDATES, latencyOf } from "../../utils/selectFastestServer";
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
  // Round trips measured from this machine, by URI. `null` is a server that
  // was asked and did not answer, which is worth saying; absent is one still
  // being asked.
  const [timed, setTimed] = useState<Map<string, number | null>>(new Map());
  const [sweeping, setSweeping] = useState(false);

  // Fetched when the modal opens rather than on mount, so a line that is never
  // clicked never asks the registry anything.
  //
  // Then timed from here. The registry's ping is measured from the registry,
  // which is a fine way to narrow a field and a poor way to tell this user
  // which server is close to them — so the list says what it is worth as soon
  // as it can, and replaces it with the truth as the answers land.
  //
  // A sweep, not the launch's race: a race ends on the first reply and never
  // learns what the rest would have said, which is exactly the information a
  // list of servers exists to show. It costs the slowest answer instead of the
  // fastest, which is the wrong trade at launch and the right one here, on a
  // screen opened on purpose to compare them.
  //
  // Sorted once, when every answer is in. Reordering as they arrive would move
  // rows under a cursor already on its way to one.
  useEffect(() => {
    if (!modalIsOpen) {
      return;
    }
    let dropped = false;
    setTimed(new Map());
    (async () => {
      const live: ServerClass[] = await fetchServerList(chainName);
      if (dropped) {
        return;
      }
      const listed =
        live.length > 0 ? live : serverUrisList().filter((s: ServerClass) => !s.obsolete && s.chain_name === chainName);
      setServers(listed);
      if (listed.length === 0) {
        return;
      }

      setSweeping(true);
      const measured = await Promise.all(
        listed.map(async (server: ServerClass) => {
          const ms: number | null = await latencyOf(server);
          if (!dropped) {
            setTimed((prev: Map<string, number | null>) => new Map(prev).set(server.uri, ms));
          }
          return [server.uri, ms] as const;
        }),
      );
      if (dropped) {
        return;
      }
      const byUri = new Map(measured);
      // Answered first, quickest first among them; the silent ones keep the
      // registry's order at the bottom, where they belong without being hidden.
      setServers(
        [...listed].sort((a: ServerClass, b: ServerClass) => {
          const ma = byUri.get(a.uri);
          const mb = byUri.get(b.uri);
          if (ma === null || ma === undefined) return mb === null || mb === undefined ? 0 : 1;
          if (mb === null || mb === undefined) return -1;
          return ma - mb;
        }),
      );
      setSweeping(false);
    })();
    return () => {
      dropped = true;
      setSweeping(false);
    };
  }, [modalIsOpen, chainName]);

  // What to show beside a server: our own round trip once it has answered, the
  // registry's estimate until then, and a plain refusal for one that was asked
  // and stayed quiet.
  const timing = (server: ServerClass): string => {
    if (!timed.has(server.uri)) {
      return server.latency ? ` _ ~${server.latency} ms.` : "";
    }
    const ms = timed.get(server.uri);
    return ms === null ? " _ no answer" : ` _ ${ms} ms.`;
  };

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

      {/* Says whose measurement is on screen, because the two differ and the
          difference is the reason for the sweep. The tilde marks the borrowed
          one. */}
      {servers.length > 0 && (
        <div className={cstyles.sublight} style={{ textAlign: "center", marginBottom: 8, fontSize: 12 }}>
          {sweeping ? "Timing each server from here…" : "Response times measured from here"}
        </div>
      )}

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
            <span>{s.uri + " - " + Utils.chainDisplayName(s.chain_name) + timing(s)}</span>
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
