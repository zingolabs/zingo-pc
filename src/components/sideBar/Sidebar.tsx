import React, { ReactElement, useContext, useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import styles from "./Sidebar.module.css";
import cstyles from "../common/Common.module.css";
import routes from "../../constants/routes.json";
import { parseZcashURI, ZcashURITarget } from "../../utils/uris";
import PayURIModal from "./components/PayURIModal";
import SidebarMenuItem from "./components/SidebarMenuItem";
import { ContextApp } from "../../context/ContextAppState";
import { MixnetView } from "../../rpc/components/mixnetPresenter";
import MixnetModal from "./components/MixnetModal";
import { Logo } from "../logo";
import APP_VERSION from "../../version";
import { ServerChainNameEnum, WalletType } from "../appstate";
import BlockExplorerModal from "./components/BlockExplorerModal";
import { useCopy } from "../common/useCopy";

import { ipcRenderer, native } from "../../electronBridge";
import {
  faAddressBook,
  faCheck,
  faComments,
  faDownload,
  faHome,
  faList,
  faPaperPlane,
  faRightLeft,
  faSync,
  faTimesCircle,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";

// Modal content for "Wallet Seed Phrase / Viewing Key" extracted to its own
// component because the inline copy feedback for UFVK / birthday relies on
// useCopy() hooks, which cannot be called inside the event handler that opens
// the modal. As a component, the content owns its hook state and re-renders
// in place when the user clicks to copy. Seed phrase is intentionally NOT
// copyable to the clipboard — see the note in the JSX.
type SeedUfvkModalContentProps = {
  // null = the native call is still in flight; render a loading state instead
  // of empty content so the user gets feedback while get_seed / get_ufvk run.
  seedStr: string | null;
  ufvkStr: string | null;
  birthday: number | undefined;
};

const SeedUfvkModalContent: React.FC<SeedUfvkModalContentProps> = ({ seedStr, ufvkStr, birthday }) => {
  const { copied: ufvkCopied, copy: copyUfvk } = useCopy(1500);
  const { copied: birthdayCopied, copy: copyBirthday } = useCopy(1500);
  const birthdayStr = String(birthday ?? "");

  if (seedStr === null || ufvkStr === null) {
    return (
      <div className={cstyles.verticalflex} style={{ alignItems: "center", padding: 24 }}>
        <div style={{ marginBottom: 12 }}>Retrieving seed phrase / viewing key&hellip;</div>
        <FontAwesomeIcon icon={faSync} spin />
      </div>
    );
  }

  // Each sensitive value (seed, UFVK, birthday) lives inside this card so it's
  // visually distinct from the surrounding explanatory text. Thin accent border
  // and a slightly smaller font keep the data legible without dominating.
  // The box each of these three values sits in: the seed phrase, the viewing
  // key and the birthday.
  //
  // Little space above, plenty below. The label belongs to the box under it and
  // should read as attached to it; what needs the room is the gap to whatever
  // comes next, so the three do not run together into one column of boxes.
  const dataBoxStyle: React.CSSProperties = {
    border: "1px solid var(--color-primary)",
    borderRadius: 4,
    padding: 12,
    marginTop: 2,
    marginBottom: 16,
    fontSize: "0.85em",
  };

  return (
    <div className={cstyles.verticalflex}>
      {!!seedStr && (
        <>
          <div style={{ textAlign: "center" }}>
            This is your wallet&rsquo;s seed phrase. It can be used to recover your entire wallet. PLEASE KEEP IT SAFE!
          </div>
          {/* Seed phrase is intentionally NOT copyable to the system clipboard:
              any other process running as this user can read the clipboard,
              which would expose spend authority. */}
          <div style={{ textAlign: "center", color: "#ff6b6b", fontWeight: "bolder", marginTop: 6 }}>
            Write this seed phrase down by hand. Do not copy it to the clipboard.
          </div>
          <div
            style={{
              ...dataBoxStyle,
              textAlign: "center",
              wordBreak: "break-word",
              fontFamily: "monospace, Roboto",
              fontWeight: "bolder",
            }}
          >
            {seedStr}
          </div>
        </>
      )}
      {!!ufvkStr && (
        <>
          <div style={{ textAlign: "center" }}>
            This is your wallet&rsquo;s unified full viewing key. It can be used to recover your entire wallet. PLEASE
            KEEP IT SAFE!
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 8,
              alignItems: "baseline",
              marginTop: 10,
            }}
          >
            <span style={{ color: "white", fontWeight: "bolder" }}>Unified Full Viewing Key</span>
            {ufvkCopied && <span className={cstyles.highlight}>Copied!</span>}
          </div>

          <button
            type="button"
            aria-label="Copy viewing key"
            style={{
              ...dataBoxStyle,
              background: "none",
              border: "none",
              font: "inherit",
              // A button inherits neither, and the platform default for both is
              // meant for a grey chrome button rather than this dark panel.
              color: "inherit",
              cursor: "pointer",
              textAlign: "center",
              wordBreak: "break-word",
              fontFamily: "monospace, Roboto",
              fontWeight: "bolder",
            }}
            onClick={() => copyUfvk(ufvkStr)}
          >
            {ufvkStr}
          </button>
        </>
      )}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 8,
          alignItems: "baseline",
        }}
      >
        <span style={{ color: "white", fontWeight: "bolder" }}>Birthday</span>
        {birthdayCopied && <span className={cstyles.highlight}>Copied!</span>}
      </div>
      <button
        type="button"
        aria-label="Copy birthday"
        style={{
          ...dataBoxStyle,
          background: "none",
          border: "none",
          font: "inherit",
          color: "inherit",
          marginBottom: 0,
          alignSelf: "center",
          minWidth: 120,
          cursor: "pointer",
          textAlign: "center",
          fontFamily: "monospace, Roboto",
          fontWeight: "bolder",
        }}
        onClick={() => copyBirthday(birthdayStr)}
      >
        {birthdayStr}
      </button>
    </div>
  );
};

type SidebarProps = {
  doRescan: () => void;
};

// The Sidebar's compact Mixnet Mode line: colour, icon, and label for the
// current view. Mirrors the sync-status blocks it sits beside.
function mixnetIndicator(view: MixnetView): {
  colorClass: string;
  icon: IconDefinition;
  label: string;
  hint?: string;
} {
  switch (view.statusKey) {
    case "mixnet.status.ready":
      return { colorClass: cstyles.green, icon: faCheck, label: "Mixnet ready" };
    case "mixnet.status.bootstrapping":
      return { colorClass: cstyles.yellow, icon: faSync, label: "Mixnet connecting" };
    case "mixnet.status.off":
      return { colorClass: cstyles.yellow, icon: faTimesCircle, label: "Mixnet off (clearnet)" };
    case "mixnet.status.died":
      return {
        colorClass: cstyles.red,
        icon: faTimesCircle,
        label: "Mixnet died",
        hint: "Click to restart",
      };
    default:
      return { colorClass: cstyles.red, icon: faTimesCircle, label: "Mixnet unavailable" };
  }
}

const Sidebar: React.FC<SidebarProps> = ({ doRescan }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const context = useContext(ContextApp);
  const {
    info,
    verificationProgress,
    readOnly,
    birthday,
    setSendTo,
    openErrorModal,
    currentWallet,
    currentWalletOpenError,
    wallets,
    mixnetView,
  } = context;
  const mixnetInd = mixnetIndicator(mixnetView);

  const [payURIModalIsOpen, setPayURIModalIsOpen] = useState<boolean>(false);
  const [payURIModalInputValue, setPayURIModalInputValue] = useState<string | undefined>(undefined);

  const [blockExplorerModalIsOpen, setBlockExplorerModalIsOpen] = useState<boolean>(false);
  const [mixnetModalIsOpen, setMixnetModalIsOpen] = useState<boolean>(false);

  const currentWalletRef = useRef<WalletType | null>(null);
  const currentWalletOpenErrorRef = useRef<string>("");
  const walletsRef = useRef<WalletType[]>([]);
  const readOnlyRef = useRef<boolean>(false);
  const birthdayRef = useRef<number>(birthday);
  const doRescanRef = useRef<() => void>(doRescan);
  const payURIRef = useRef<(uri: string) => Promise<void>>(async () => {});
  // Stores a zcash: URI that arrived via IPC before the wallet was ready.
  const pendingUriRef = useRef<string | null>(null);

  let stateSync: string = "";
  let progress: string = "";
  if (info.latestBlock) {
    if (verificationProgress) {
      if (verificationProgress === 100) {
        stateSync = "CONNECTED";
        progress = "100";
      } else {
        stateSync = "SYNCING";
        progress = verificationProgress.toString();
      }
    } else {
      // no verification progress fetched
      stateSync = "CONNECTING";
    }
  } else {
    // no server latest block
    stateSync = "DISCONNECTED";
  }

  useEffect(() => {
    currentWalletRef.current = currentWallet;
  }, [currentWallet]);
  useEffect(() => {
    currentWalletOpenErrorRef.current = currentWalletOpenError;
  }, [currentWalletOpenError]);
  useEffect(() => {
    walletsRef.current = wallets;
  }, [wallets]);
  useEffect(() => {
    readOnlyRef.current = readOnly;
  }, [readOnly]);
  useEffect(() => {
    birthdayRef.current = birthday;
  }, [birthday]);
  useEffect(() => {
    doRescanRef.current = doRescan;
  }, [doRescan]);

  // Consume any pending zcash: URI once the app knows its wallet state.
  // Fires when: wallet finishes loading (go to Send) or no wallets configured (show error).
  useEffect(() => {
    // currentWallet starts as `{} as WalletType`; a real wallet always has an id.
    const walletReady = !!currentWallet?.id && !currentWalletOpenError && !readOnly;
    const noWallets = currentWallet === null && wallets.length === 0;
    const readOnlyWallet = !!currentWallet?.id && !currentWalletOpenError && readOnly;

    if (!walletReady && !noWallets && !readOnlyWallet) return;

    const consumePending = async () => {
      // Claim the URI: local ref first, then main process (cold start).
      const uri: string | null = pendingUriRef.current ?? (await ipcRenderer.invoke("get-pending-uri"));
      pendingUriRef.current = null;

      if (!uri) return;

      if (noWallets) {
        openErrorModal("Pay URI", "No wallet configured. Please add a wallet before using a payment link.");
        return;
      }

      if (readOnlyWallet) {
        openErrorModal("Pay URI", "This is a watch-only wallet. It cannot send transactions.");
        return;
      }

      payURIRef.current(uri);
    };

    consumePending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWallet, currentWalletOpenError, wallets]);

  // Handle menu items
  useEffect(() => {
    // contextBridge wraps every function argument in a new proxy each time it
    // crosses the context boundary, so ipcRenderer.off() cannot match the proxy
    // that ipcRenderer.on() received — the old listener is never removed.
    // React 18 StrictMode runs effects twice (mount → cleanup → mount), which
    // causes two listeners to accumulate.  The `active` flag makes stale
    // closures silently no-op so only the latest registration acts on events.
    let active = true;

    // About
    const about = (_event: any) => {
      if (!active) return;
      openErrorModal(
        "Zingo PC",
        <div className={cstyles.verticalflex}>
          <div className={cstyles.margintoplarge}>Zingo PC v{APP_VERSION}</div>
          <div className={cstyles.margintoplarge}>Built with Electron. Copyright (c) 2026, ZingoLabs.</div>
          <div className={cstyles.margintoplarge}>
            The MIT License (MIT) Copyright (c) 2026 ZingoLabs
            <br />
            <br />
            Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
            documentation files (the &quot;Software&quot;), to deal in the Software without restriction, including
            without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
            copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the
            following conditions:
            <br />
            <br />
            The above copyright notice and this permission notice shall be included in all copies or substantial
            portions of the Software.
            <br />
            <br />
            THE SOFTWARE IS PROVIDED &quot;AS IS&quot;, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
            NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
            NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
            IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
            USE OR OTHER DEALINGS IN THE SOFTWARE.
          </div>
        </div>,
      );
    };

    const payuri = (_event: any, uri: string) => {
      if (!active) return;
      if (!uri) {
        // Manual path (menu / Ctrl+P): open modal so the user can type the URI.
        openPayURIModal("");
        return;
      }
      // External link path: go directly to Send, no intermediate modal.
      if (currentWalletRef.current === null && walletsRef.current.length === 0) {
        openErrorModal("Pay URI", "No wallet configured. Please add a wallet before using a payment link.");
      } else if (readOnlyRef.current) {
        openErrorModal("Pay URI", "This is a watch-only wallet. It cannot send transactions.");
      } else if (currentWalletRef.current?.id && !currentWalletOpenErrorRef.current) {
        payURIRef.current(uri);
      } else {
        // Wallet still loading: park until ready.
        pendingUriRef.current = uri;
      }
    };

    // Block Explorer Selection
    const blockexplorer = (_event: any) => {
      if (!active) return;
      setBlockExplorerModalIsOpen(true);
    };

    // Export Seed
    const seed = async (_event: any) => {
      if (!active) return;
      if (!currentWalletRef.current || !!currentWalletOpenErrorRef.current) {
        openErrorModal("Wallet Seed Phrase/Viewing Key", "There is not an active Wallet to perform the action.");
        return;
      }

      // Re-authenticate before exposing seed/UFVK, even mid-session. The
      // startup lock screen gates app entry but a long-running session would
      // otherwise let anyone with screen access reveal the spend authority
      // (seed) or the viewing key (full tx history + balance). Matches the
      // pattern in SendConfirmModal.sendButton.
      const allSettings = await ipcRenderer.invoke("loadSettings");
      if (allSettings?.requireDeviceAuth) {
        const authResult: { success: boolean } = await ipcRenderer.invoke(
          "auth:verify",
          "Show seed phrase / viewing key",
        );
        if (!authResult.success) return;
      }

      // Open the modal with a loading state before the native fetches so the
      // user gets immediate feedback. get_seed / get_ufvk can each take a
      // noticeable moment, and previously the UI sat silent between the auth
      // prompt closing and the modal appearing.
      openErrorModal(
        "Wallet Seed Phrase / Viewing Key",
        <SeedUfvkModalContent seedStr={null} ufvkStr={null} birthday={birthdayRef.current} />,
      );

      // Always fetch the UFVK — for seed wallets it's derived from the seed, and
      // showing it alongside the seed lets the user share view-only access without
      // exposing spend authority. Run both native calls in parallel.
      try {
        // get_seed / get_ufvk reject (typed error on the throw channel) if the
        // key material can't be read; surface that instead of leaving the modal
        // in its loading state.
        const [seedRaw, ufvkRaw] = await Promise.all([
          readOnlyRef.current ? Promise.resolve("") : native.get_seed(),
          native.get_ufvk(),
        ]);
        const seedStr: string = seedRaw ? (JSON.parse(seedRaw).seed_phrase ?? "") : "";
        const ufvkStr: string = ufvkRaw ? (JSON.parse(ufvkRaw).ufvk ?? "") : "";

        if (!active) return;
        openErrorModal(
          "Wallet Seed Phrase / Viewing Key",
          <SeedUfvkModalContent seedStr={seedStr} ufvkStr={ufvkStr} birthday={birthdayRef.current} />,
        );
      } catch (error) {
        if (!active) return;
        console.error(`Error reading seed/ufvk ${error}`);
        openErrorModal("Wallet Seed Phrase / Viewing Key", `${error}`);
      }
    };

    const rescan = async (_event: any) => {
      if (!active) return;
      if (!currentWalletRef.current || !!currentWalletOpenErrorRef.current) {
        openErrorModal("Rescan Wallet", "There is not an active Wallet to perform the action.");
      } else {
        doRescanRef.current();
      }
    };

    const addnewwallet = (_event: any) => {
      if (!active) return;
      navigate(routes.ADDNEWWALLET, { state: { mode: "addnew" } });
    };

    const settingswallet = (_event: any) => {
      if (!active) return;
      if (!currentWalletRef.current || !!currentWalletOpenErrorRef.current) {
        openErrorModal("Wallet Settings", "There is not an active Wallet to perform the action.");
      } else {
        navigate(routes.ADDNEWWALLET, { state: { mode: "settings" } });
      }
    };

    const insight = (_event: any) => {
      if (!active) return;
      if (!currentWalletRef.current || !!currentWalletOpenErrorRef.current) {
        openErrorModal("Financial Insight", "There is not an active Wallet to perform the action.");
      } else {
        navigate(routes.INSIGHT);
      }
    };

    const deletewallet = (_event: any) => {
      if (!active) return;
      if (!currentWalletRef.current) {
        openErrorModal("Delete Wallet", "There is not an active Wallet to perform the action.");
      } else {
        navigate(routes.ADDNEWWALLET, { state: { mode: "delete" } });
      }
    };

    const mixnetsettings = (_event: any) => {
      if (!active) return;
      setMixnetModalIsOpen(true);
    };

    ipcRenderer.on("about", about);
    ipcRenderer.on("payuri", payuri);
    ipcRenderer.on("blockexplorer", blockexplorer);
    ipcRenderer.on("seed", seed);
    ipcRenderer.on("rescan", rescan);
    ipcRenderer.on("addnewwallet", addnewwallet);
    ipcRenderer.on("settingswallet", settingswallet);
    ipcRenderer.on("deletewallet", deletewallet);
    ipcRenderer.on("mixnet-settings", mixnetsettings);
    ipcRenderer.on("insight", insight);

    return () => {
      active = false;
      ipcRenderer.off("about", about);
      ipcRenderer.off("payuri", payuri);
      ipcRenderer.off("blockexplorer", blockexplorer);
      ipcRenderer.off("seed", seed);
      ipcRenderer.off("rescan", rescan);
      ipcRenderer.off("addnewwallet", addnewwallet);
      ipcRenderer.off("settingswallet", settingswallet);
      ipcRenderer.off("deletewallet", deletewallet);
      ipcRenderer.off("mixnet-settings", mixnetsettings);
      ipcRenderer.off("insight", insight);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openPayURIModal = (defaultValue: string | null) => {
    const _uriModalInputValue: string = defaultValue || "";
    setPayURIModalIsOpen(true);
    setPayURIModalInputValue(_uriModalInputValue);
  };

  const setPayURIInputValue = (_uriModalInputValue: string) => {
    setPayURIModalInputValue(_uriModalInputValue);
  };

  const closePayURIModal = () => {
    setPayURIModalIsOpen(false);
  };

  const payURI = async (uri: string) => {
    const errTitle: string = "URI Error";
    const getErrorBody = (explain: string): ReactElement => {
      return (
        <div>
          <span>{explain}</span>
          <br />
        </div>
      );
    };

    if (!uri || uri === "") {
      openErrorModal(errTitle, getErrorBody("URI was not found or invalid"));
      return;
    }

    const parsedUri: string | ZcashURITarget = await parseZcashURI(uri, currentWallet ? currentWallet.chain_name : "");
    if (typeof parsedUri === "string") {
      if (!parsedUri || parsedUri.toLowerCase().startsWith("error")) {
        openErrorModal(errTitle, getErrorBody(parsedUri));
        return;
      } else {
        setSendTo({ address: parsedUri });
      }
    } else {
      setSendTo(parsedUri);
    }

    navigate(routes.SEND);
  };

  // Keep the ref pointing at the latest closure so the IPC handler never goes stale.
  payURIRef.current = payURI;

  return (
    <div>
      <PayURIModal
        modalInput={payURIModalInputValue}
        setModalInput={setPayURIInputValue}
        modalIsOpen={payURIModalIsOpen}
        closeModal={closePayURIModal}
        modalTitle="Pay URI"
        actionButtonName="Pay URI"
        actionCallback={payURI}
      />

      <BlockExplorerModal
        modalIsOpen={blockExplorerModalIsOpen}
        closeModal={() => setBlockExplorerModalIsOpen(false)}
        modalTitle="Select Block Explorer"
      />

      <MixnetModal modalIsOpen={mixnetModalIsOpen} closeModal={() => setMixnetModalIsOpen(false)} />

      <div className={`${cstyles.center} ${styles.sidebarlogobg}`}>
        <Logo readOnly={readOnly} onlyVersion={false} />
      </div>

      <div className={styles.sidebar}>
        <SidebarMenuItem
          name="Dashboard"
          routeName={routes.DASHBOARD}
          currentRoute={location.pathname}
          iconname={faHome}
        />
        {!readOnly && currentWallet !== null && !currentWalletOpenError && (
          <SidebarMenuItem
            name="Send"
            routeName={routes.SEND}
            currentRoute={location.pathname}
            iconname={faPaperPlane}
          />
        )}
        {currentWallet !== null && !currentWalletOpenError && (
          <SidebarMenuItem
            name="Receive"
            routeName={routes.RECEIVE}
            currentRoute={location.pathname}
            iconname={faDownload}
          />
        )}
        {/* Two reasons the entry can be absent rather than dead. SwapKit routes
            none of our providers off mainnet, and a swap's deposit is a spend,
            which a viewing-key wallet cannot make. */}
        {currentWallet !== null &&
          !currentWalletOpenError &&
          !readOnly &&
          currentWallet.chain_name === ServerChainNameEnum.mainChainName && (
            <SidebarMenuItem
              name="Swap"
              routeName={routes.SWAP}
              currentRoute={location.pathname}
              iconname={faRightLeft}
            />
          )}
        {currentWallet !== null && !currentWalletOpenError && (
          <SidebarMenuItem
            name="History"
            routeName={routes.HISTORY}
            currentRoute={location.pathname}
            iconname={faList}
          />
        )}
        {currentWallet !== null && !currentWalletOpenError && (
          <SidebarMenuItem
            name="Messages"
            routeName={routes.MESSAGES}
            currentRoute={location.pathname}
            iconname={faComments}
          />
        )}
        <SidebarMenuItem
          name="Address Book"
          routeName={routes.ADDRESSBOOK}
          currentRoute={location.pathname}
          iconname={faAddressBook}
        />
      </div>

      <div className={cstyles.center} style={{ marginTop: 6 }}>
        {stateSync === "CONNECTED" && (
          <div className={`${cstyles.padsmallall} ${cstyles.margintopsmall} ${cstyles.blackbg}`}>
            <div>
              {info.latestBlock === info.walletHeight ? (
                <FontAwesomeIcon icon={faCheck} className={cstyles.green} />
              ) : (
                <FontAwesomeIcon icon={faCheck} className={cstyles.yellow} />
              )}
              &nbsp; {info.walletHeight} &nbsp;
            </div>
            {info.latestBlock > info.walletHeight && `(${info.latestBlock - info.walletHeight} blocks behind)`}
          </div>
        )}
        {stateSync === "SYNCING" && (
          <div className={`${cstyles.padsmallall} ${cstyles.margintopsmall} ${cstyles.blackbg}`}>
            <div>
              <FontAwesomeIcon icon={faSync} className={cstyles.yellow} />
              &nbsp; Syncing
            </div>
            <div>{`${progress}%`}</div>
          </div>
        )}
        {stateSync === "DISCONNECTED" && (
          <div className={`${cstyles.padsmallall} ${cstyles.margintopsmall} ${cstyles.blackbg}`}>
            <FontAwesomeIcon icon={faTimesCircle} className={cstyles.yellow} />
            &nbsp; Not Connected
          </div>
        )}
        {stateSync === "CONNECTING" && (
          <div className={`${cstyles.padsmallall} ${cstyles.margintopsmall} ${cstyles.blackbg}`}>
            <FontAwesomeIcon icon={faTimesCircle} className={cstyles.yellow} />
            &nbsp; Connecting...
          </div>
        )}
        {currentWallet && (
          <button
            type="button"
            className={`${cstyles.padsmallall} ${cstyles.margintopsmall} ${cstyles.blackbg}`}
            onClick={() => setMixnetModalIsOpen(true)}
            style={{
              cursor: "pointer",
              // No background: `.blackbg` on the class list is the background,
              // and no text-align: the tiles above inherit theirs.
              border: "none",
              font: "inherit",
              color: "inherit",
              width: "100%",
            }}
            title="Nym mixnet settings"
            aria-label="Nym mixnet settings"
          >
            <div>
              <FontAwesomeIcon icon={mixnetInd.icon} className={mixnetInd.colorClass} />
              &nbsp; {mixnetInd.label}
            </div>
            {mixnetView.narration ? (
              <div className={cstyles.small}>{mixnetView.narration}</div>
            ) : (
              !!mixnetInd.hint && <div className={cstyles.small}>{mixnetInd.hint}</div>
            )}
          </button>
        )}
      </div>
    </div>
  );
};

export default Sidebar;
