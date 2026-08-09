import React, { useContext } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./ServerHealthLine.module.css";
import { ContextApp } from "../../context/ContextAppState";
import routes from "../../constants/routes.json";
import { ServerSelectionEnum } from "../appstate";
import { ServerHealthLevel, deriveServerHealth } from "../../rpc/components/serverHealth";

// Colour lives on the dot alone. The URI and the mode badge stay in body text,
// so the one coloured thing on the line is the one thing that means something.
const DOT_COLOUR: Record<ServerHealthLevel, string> = {
  unknown: "var(--color-primary-disable)",
  ok: "var(--color-primary)",
  unstable: "var(--color-warning)",
  down: "var(--color-error)",
};

const PROMPT: Record<string, string> = {
  unstable: "This server has failed some checks this session.",
  down: "This server has not answered the last three checks.",
};

/**
 * The active server, its selection mode and a health dot, right-aligned above
 * the balances so a long URI grows leftwards and never moves anything.
 *
 * The mode is read from the wallet record rather than from local state on
 * purpose: it is the only place in the app that shows, at all times, which mode
 * is actually in force.
 */
const ServerHealthLine: React.FC = () => {
  const navigate = useNavigate();
  const { currentWallet, info, serverHealth, openConfirmModal, rotateServer } = useContext(ContextApp);

  if (!currentWallet) {
    return null;
  }

  // The wallet record is the source of truth, but an older record can carry no
  // URI while the session is perfectly well connected. Falling back to the one
  // the server itself reports keeps the line from vanishing in that case.
  const uri: string = currentWallet.uri || info.serverUri || "";
  const level: ServerHealthLevel = deriveServerHealth(serverHealth);
  const mode: ServerSelectionEnum = currentWallet.selection;
  const openSettings = () => navigate(routes.ADDNEWWALLET, { state: { mode: "settings" } });

  const onClick = () => {
    if (level !== "unstable" && level !== "down") {
      openSettings();
      return;
    }
    // `auto` means the user delegated the choice, so accepting swaps the server
    // in place. Any other mode is a choice they made by hand, and we send them
    // to the picker rather than overriding it.
    if (mode === ServerSelectionEnum.auto) {
      openConfirmModal("Server not responding", `${PROMPT[level]} Switch to another server?`, rotateServer);
    } else {
      openConfirmModal("Server not responding", `${PROMPT[level]} Review the server settings?`, openSettings);
    }
  };

  return (
    <button type="button" className={styles.line} onClick={onClick} aria-label="Active server health">
      <span className={styles.uri}>{uri}</span>
      {mode && <span className={styles.badge}>{mode}</span>}
      <span
        className={styles.dot}
        style={{ color: DOT_COLOUR[level] }}
        data-health={level}
        data-testid="server-health-dot"
        aria-hidden="true"
      />
    </button>
  );
};

export default ServerHealthLine;
