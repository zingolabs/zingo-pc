import Modal from "react-modal";
import { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import cstyles from "../../common/Common.module.css";
import { ContextApp } from "../../../context/ContextAppState";
import RPC from "../../../rpc/rpc";
import routes from "../../../constants/routes.json";
import nymLogo from "../../../assets/nym-on.svg";
import { DoctorSteps, DoctorTechnicalDetails, TONE_CLASS, useMixnetDoctor } from "./MixnetDoctor";

// The Nym brand green (from the mobile nym UI), used as a discreet accent.
const NYM_GREEN = "#07FF94";

type MixnetModalProps = {
  modalIsOpen: boolean;
  closeModal: () => void;
};

const STATUS_TEXT: Record<string, string> = {
  "mixnet.status.ready": "Connected",
  "mixnet.status.bootstrapping": "Connecting…",
  "mixnet.status.retrying": "Can't reach the mixnet yet",
  "mixnet.status.off": "Off for this session",
  "mixnet.status.unattached": "Not connected",
  "mixnet.status.died": "Connection to the mixnet was lost",
  "mixnet.status.unknown": "Unknown",
};

// Its own component so the doctor reads main only while the screen is open: the
// modal renders its children only then.
const MixnetScreen = ({ closeModal }: { closeModal: () => void }) => {
  const { mixnetView } = useContext(ContextApp);
  const navigate = useNavigate();
  const doctor = useMixnetDoctor();
  const [busy, setBusy] = useState<boolean>(false);
  const [detailsOpen, setDetailsOpen] = useState<boolean>(false);

  // Active while the transport is up or coming up; anything else (off,
  // unattached, died) offers Enable so a failed start can be retried.
  const active =
    mixnetView.statusKey === "mixnet.status.ready" ||
    mixnetView.statusKey === "mixnet.status.bootstrapping" ||
    mixnetView.statusKey === "mixnet.status.retrying";
  const off = mixnetView.statusKey === "mixnet.status.off";
  // The transport is absent and nobody consented to clearnet, so sends refuse.
  // Enable is not always a way out — a build with no proxy binary can never
  // start one — and without the opt-out the user is stranded with a wallet that
  // will not send at all. Switching off needs no proxy: it only records the
  // consent.
  const stranded = !active && !off;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch {
      // The status poll republishes the outcome; the modal reflects it on the
      // next cycle. A failed enable stays fail-closed.
    } finally {
      setBusy(false);
    }
  };

  const verdict = doctor.verdict;
  const chooseServer = () => {
    closeModal();
    navigate(routes.ADDNEWWALLET, { state: { mode: "settings" } });
  };
  // A stranded transport already offers Enable, which is this same restart.
  const offerRestart = verdict?.action === "restart" && !stranded;
  const offerServer = verdict?.action === "server";
  // Something is wrong, so what we would ask for goes where it can be seen.
  const offerReport = verdict?.tone === "bad" || verdict?.tone === "warn";

  return (
    <>
      <div
        className={cstyles.xlarge}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
      >
        <img src={nymLogo} alt="" width={20} height={20} />
        Nym Mixnet
      </div>

      <div style={{ marginTop: 24, textAlign: "center" }}>
        {doctor.running ? (
          <>
            <div>Checking…</div>
            <div className={cstyles.small} style={{ marginTop: 4, opacity: 0.6 }}>
              This can take up to a minute.
            </div>
          </>
        ) : (
          <>
            <div
              className={verdict ? TONE_CLASS[verdict.tone] : undefined}
              style={verdict?.tone === "ok" ? { color: NYM_GREEN } : undefined}
            >
              {verdict?.headline ?? STATUS_TEXT[mixnetView.statusKey] ?? "Unknown"}
            </div>
            {verdict?.detail && (
              <div className={cstyles.small} style={{ marginTop: 4, overflowWrap: "anywhere" }}>
                {verdict.detail}
              </div>
            )}
          </>
        )}
      </div>

      {doctor.steps && <DoctorSteps steps={doctor.steps} />}

      {stranded && (
        <div className={`${cstyles.well} ${cstyles.small} ${cstyles.yellow}`} style={{ marginTop: 16 }}>
          Sending is refused while the mixnet is neither ready nor deliberately off. If it cannot start on this machine,
          switch it off to send over clearnet for this session.
        </div>
      )}

      {/* A row, not centred inline-blocks: the default container stacks them. It
          may wrap, since which of these show depends on what the doctor found. */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          marginTop: 24,
        }}
      >
        {offerServer && (
          <button type="button" className={cstyles.primarybutton} onClick={chooseServer}>
            Choose server
          </button>
        )}
        {offerRestart && (
          <button
            type="button"
            className={cstyles.primarybutton}
            onClick={() => run(RPC.restartMixnet)}
            disabled={busy}
          >
            Restart
          </button>
        )}
        <button
          type="button"
          className={cstyles.primarybutton}
          onClick={doctor.runDiagnostics}
          disabled={doctor.running}
        >
          {doctor.steps ? "Run again" : "Run diagnostics"}
        </button>
        {offerReport && (
          <button type="button" className={cstyles.primarybutton} onClick={doctor.copyReport}>
            {doctor.copied ? "Copied" : "Copy report"}
          </button>
        )}
        {!(offerServer || offerRestart) || stranded ? (
          <button
            type="button"
            className={cstyles.primarybutton}
            onClick={() => run(active ? RPC.stopMixnet : RPC.startMixnet)}
            disabled={busy}
          >
            {active ? "Disable" : "Enable"}
          </button>
        ) : null}
        {stranded && (
          <button type="button" className={cstyles.primarybutton} onClick={() => run(RPC.stopMixnet)} disabled={busy}>
            Switch off
          </button>
        )}
        <button type="button" className={cstyles.secondarybutton} onClick={closeModal}>
          Close
        </button>
      </div>

      <div className={cstyles.small} style={{ marginTop: 12, opacity: 0.6, textAlign: "center" }}>
        Diagnostics check each step, contacting Nym and your server from your IP.
      </div>

      <div style={{ marginTop: 16, textAlign: "center" }}>
        <button
          type="button"
          className={cstyles.small}
          onClick={() => setDetailsOpen(true)}
          style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0 }}
        >
          Technical details
        </button>
      </div>

      {detailsOpen && doctor.state && (
        <DoctorTechnicalDetails doctor={doctor} closeModal={() => setDetailsOpen(false)} />
      )}
    </>
  );
};

const MixnetModal = ({ modalIsOpen, closeModal }: MixnetModalProps) => (
  <Modal
    isOpen={modalIsOpen}
    onRequestClose={closeModal}
    className={cstyles.centredsheet}
    overlayClassName={cstyles.modalOverlay}
    // An explicit width: centred with `left: 50%`, the sheet would otherwise never
    // grow past half the window.
    style={{ content: { width: "min(560px, calc(100vw - 64px))" } }}
  >
    <MixnetScreen closeModal={closeModal} />
  </Modal>
);

export default MixnetModal;
