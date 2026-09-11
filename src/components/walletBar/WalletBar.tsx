import React, { useContext } from "react";
import styles from "./WalletBar.module.css";
import SelectWallet from "./SelectWallet";
import { ServerHealthLine } from "../serverHealthLine";
import { ContextApp } from "../../context/ContextAppState";

type WalletBarProps = {
  navigateToLoadingScreenChangingWallet: () => void;
};

/**
 * Which wallet you are in, and which server it is talking to — on one line,
 * above every screen.
 *
 * Both halves used to live somewhere narrower or somewhere repeated. The
 * selector was in the sidebar, a 220px column, where a wallet whose alias runs
 * long had nowhere to put it; here it has the width of the content area, which
 * is several times that. The server line was pasted into five screens
 * separately — Dashboard, Send, Receive, History, Messages — and drifted onto
 * none of the others; here it is stated once and reaches all of them.
 *
 * Hidden entirely when there is no wallet. A selector with nothing to select
 * is not a control, and the one action worth offering then — adding a wallet —
 * the Dashboard already offers, on the only screen reachable without one.
 *
 * The server line additionally stands down while the current wallet cannot be
 * opened: the selector is the way out of that state and must stay, but the
 * health of a server this wallet never reached is not a fact worth asserting.
 */
const WalletBar = ({ navigateToLoadingScreenChangingWallet }: WalletBarProps) => {
  const { currentWallet, currentWalletOpenError } = useContext(ContextApp);

  // `currentWallet` starts as `{} as WalletType`, so the id is what says a real
  // wallet is loaded — the same test the sidebar's menu gating uses.
  if (!currentWallet?.id) return null;

  return (
    <div className={styles.bar}>
      <div className={styles.selector}>
        <SelectWallet navigateToLoadingScreenChangingWallet={navigateToLoadingScreenChangingWallet} />
      </div>
      {!currentWalletOpenError && (
        <div className={styles.server}>
          <ServerHealthLine />
        </div>
      )}
    </div>
  );
};

export default WalletBar;
