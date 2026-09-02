import React, { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./ServerHealthLine.module.css";
import ServerPickerModal from "./ServerPickerModal";
import { ContextApp } from "../../context/ContextAppState";
import routes from "../../constants/routes.json";
import { ServerSelectionEnum } from "../appstate";
import Utils from "../../utils/utils";
import { ServerHealthLevel, deriveServerHealth } from "../../rpc/components/serverHealth";
import { rotationCandidates } from "../../utils/pickRotationTarget";

// Colour lives on the dot alone. The URI and the mode badge stay in body text,
// so the one coloured thing on the line is the one thing that means something.
const DOT_COLOUR: Record<ServerHealthLevel, string> = {
  unknown: "var(--color-primary-disable)",
  ok: "var(--color-primary)",
  unstable: "var(--color-warning)",
  down: "var(--color-error)",
};

// What the colour is telling you. Amber and red are the ones that need saying:
// a light nobody can read is a light nobody acts on.
const DOT_TOOLTIP: Record<ServerHealthLevel, string> = {
  unknown: "Waiting for the first check of this server.",
  ok: "This server is answering.",
  unstable: "This server has failed some checks this session, but not three in a row.",
  down: "This server has not answered the last three checks.",
};

/**
 * The active server, its network, its selection mode and a health dot, right-aligned above
 * the balances so a long URI grows leftwards and never moves anything.
 *
 * Clicking follows the mode, not the colour. The mode says who owns the choice
 * of server, and that is what decides who gets to change it:
 *
 *  - `auto`   the user delegated it, so offer to move to another server
 *  - `list`   the user picks from ours, so show that list right here
 *  - `custom` the server is theirs, so hand them the settings screen
 */
const ServerHealthLine: React.FC = () => {
  const navigate = useNavigate();
  const { currentWallet, info, serverHealth, openConfirmModal, openErrorModal, rotateServer, avoidedServers } =
    useContext(ContextApp);
  const [pickerOpen, setPickerOpen] = useState(false);

  if (!currentWallet) {
    return null;
  }

  // The wallet record is the source of truth, but an older record can carry no
  // URI while the session is perfectly well connected. Falling back to the one
  // the server itself reports keeps the line from vanishing in that case.
  const uri: string = currentWallet.uri || info.serverUri || "";
  const level: ServerHealthLevel = deriveServerHealth(serverHealth);
  const mode: ServerSelectionEnum = currentWallet.selection;
  // Which network this wallet is on. Nothing else on screen says: the
  // selector's optgroups label it, but a closed select shows only the alias.
  // Empty for a chain name that is none of the three, which renders nothing
  // rather than an empty badge.
  const network: string = Utils.chainDisplayName(currentWallet.chain_name);

  const onClick = async () => {
    if (mode === ServerSelectionEnum.auto) {
      // Ask only when there is something to ask about. Testnet publishes a
      // single usable server, so the confirmation used to appear with nowhere to
      // go and then sat out a probe timeout to say so.
      const elsewhere = await rotationCandidates(currentWallet.chain_name, [...avoidedServers, uri]);
      if (elsewhere.length === 0) {
        openErrorModal("Change Server", "This network publishes no other server to move to.");
        return;
      }
      // Rotating is the answer for "this one is misbehaving", and it is the
      // one auto exists to give. But a user who opened this because they want
      // a particular server had nowhere to say so: the picker only ever
      // appeared for a wallet already on `list`, which is a mode they could
      // only reach through the wallet settings screen.
      //
      // Choosing there switches them to `list`, because naming a server by
      // hand is what that mode means.
      openConfirmModal("Change Server", `${DOT_TOOLTIP[level]} Move to another server?`, rotateServer, {
        label: "Servers List",
        action: () => setPickerOpen(true),
      });
    } else if (mode === ServerSelectionEnum.list) {
      setPickerOpen(true);
    } else {
      navigate(routes.ADDNEWWALLET, { state: { mode: "settings" } });
    }
  };

  return (
    <>
      <button type="button" className={styles.line} onClick={onClick} aria-label="Active server health">
        <span className={styles.uri}>{uri}</span>
        {/* Network before selection mode: which chain you are on outranks who
            chose the server on it. Both wear the same badge — they are two
            facts about the same connection, and giving one its own colour
            would make it a warning, which is a different claim. */}
        {!!network && <span className={styles.badge}>{network}</span>}
        {mode && <span className={styles.badge}>{mode}</span>}
        {/* The dot carries the tooltip itself, so it is the thing you hover and
            the thing that explains itself. */}
        <span
          className={styles.dot}
          style={{ color: DOT_COLOUR[level] }}
          title={DOT_TOOLTIP[level]}
          data-health={level}
          data-testid="server-health-dot"
          role="img"
          aria-label={DOT_TOOLTIP[level]}
        />
      </button>
      <ServerPickerModal
        modalIsOpen={pickerOpen}
        closeModal={() => setPickerOpen(false)}
        chainName={currentWallet.chain_name}
        currentUri={uri}
      />
    </>
  );
};

export default ServerHealthLine;
