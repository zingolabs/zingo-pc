import React, { ReactElement, useContext, useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import styles from "./Sidebar.module.css";
import cstyles from "../common/Common.module.css";
import routes from "../../constants/routes.json";
import { parseZcashURI, ZcashURITarget } from "../../utils/uris";
import PayURIModal from "./components/PayURIModal";
import SidebarMenuItem from "./components/SidebarMenuItem";
import { ContextApp } from "../../context/ContextAppState";
import { Logo } from "../logo";
import APP_VERSION from "../../version";
import SelectWallet from "./components/SelectWallet";
import { WalletType } from "../appstate";
import BlockExplorerModal from "./components/BlockExplorerModal";

import { ipcRenderer, native } from "../../electronBridge";

type SidebarProps = {
  doRescan: () => void;
  navigateToLoadingScreenChangingWallet: () => void;
  setBlockExplorer: (be: any) => void;
};

const Sidebar: React.FC<SidebarProps> = ({ doRescan, navigateToLoadingScreenChangingWallet, setBlockExplorer }) => {
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
    blockExplorerMainnetAddress,
    blockExplorerMainnetAddressCustom,
    blockExplorerMainnetTransaction,
    blockExplorerMainnetTransactionCustom,
    blockExplorerTestnetAddress,
    blockExplorerTestnetAddressCustom,
    blockExplorerTestnetTransaction,
    blockExplorerTestnetTransactionCustom,
  } = context;

  const [payURIModalIsOpen, setPayURIModalIsOpen] = useState<boolean>(false);
  const [payURIModalInputValue, setPayURIModalInputValue] = useState<string | undefined>(undefined);

  const [blockExplorerModalIsOpen, setBlockExplorerModalIsOpen] = useState<boolean>(false);

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
      openBlockExplorerModal();
    };

    // Export Seed
    const seed = async (_event: any) => {
      if (!active) return;
      if (!currentWalletRef.current || !!currentWalletOpenErrorRef.current) {
        openErrorModal("Wallet Seed Phrase/Viewing Key", "There is not an active Wallet to perform the action.");
        return;
      }

      const seedRaw: string = readOnlyRef.current ? "" : await native.get_seed();
      const ufvkRaw: string = readOnlyRef.current ? await native.get_ufvk() : "";
      const seedStr: string = seedRaw ? (JSON.parse(seedRaw).seed_phrase ?? "") : "";
      const ufvkStr: string = ufvkRaw ? (JSON.parse(ufvkRaw).ufvk ?? "") : "";

      openErrorModal(
        "Wallet Seed Phrase / Viewing Key",
        <div className={cstyles.verticalflex}>
          {!!seedStr && (
            <>
              <div>
                This is your wallet&rsquo;s seed phrase. It can be used to recover your entire wallet.
                <br />
                PLEASE KEEP IT SAFE!
              </div>
              <hr style={{ width: "100%" }} />
              <div
                style={{
                  wordBreak: "break-word",
                  fontFamily: "monospace, Roboto",
                  fontWeight: "bolder",
                }}
              >
                {seedStr}
              </div>
              <hr style={{ width: "100%" }} />
            </>
          )}
          {!!ufvkStr && (
            <>
              <div>
                This is your wallet&rsquo;s unified full viewing key. It can be used to recover your entire wallet.
                <br />
                PLEASE KEEP IT SAFE!
              </div>
              <hr style={{ width: "100%" }} />
              <div
                style={{
                  fontFamily: "monospace, Roboto",
                  fontWeight: "bolder",
                }}
              >
                {ufvkStr}
              </div>
              <hr style={{ width: "100%" }} />
            </>
          )}
          <div
            style={{
              fontFamily: "monospace, Roboto",
            }}
          >
            {"Birthday: " + birthdayRef.current}
          </div>
        </div>,
      );
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

    const deletewallet = (_event: any) => {
      if (!active) return;
      if (!currentWalletRef.current) {
        openErrorModal("Delete Wallet", "There is not an active Wallet to perform the action.");
      } else {
        navigate(routes.ADDNEWWALLET, { state: { mode: "delete" } });
      }
    };

    ipcRenderer.on("about", about);
    ipcRenderer.on("payuri", payuri);
    ipcRenderer.on("blockexplorer", blockexplorer);
    ipcRenderer.on("seed", seed);
    ipcRenderer.on("rescan", rescan);
    ipcRenderer.on("addnewwallet", addnewwallet);
    ipcRenderer.on("settingswallet", settingswallet);
    ipcRenderer.on("deletewallet", deletewallet);

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

  const openBlockExplorerModal = () => {
    setBlockExplorerModalIsOpen(true);
  };

  const closeBlockExplorerModal = () => {
    setBlockExplorerModalIsOpen(false);
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
        modalInput={{
          blockExplorerMainnetAddress,
          blockExplorerMainnetAddressCustom,
          blockExplorerMainnetTransaction,
          blockExplorerMainnetTransactionCustom,
          blockExplorerTestnetAddress,
          blockExplorerTestnetAddressCustom,
          blockExplorerTestnetTransaction,
          blockExplorerTestnetTransactionCustom,
        }}
        setModalInput={setBlockExplorer}
        modalIsOpen={blockExplorerModalIsOpen}
        closeModal={closeBlockExplorerModal}
        modalTitle="Select Block Explorer"
      />

      <div className={`${cstyles.center} ${styles.sidebarlogobg}`}>
        <Logo readOnly={readOnly} onlyVersion={false} />
      </div>

      <div className={styles.sidebar}>
        <SelectWallet navigateToLoadingScreenChangingWallet={navigateToLoadingScreenChangingWallet} />
        <SidebarMenuItem
          name="Dashboard"
          routeName={routes.DASHBOARD}
          currentRoute={location.pathname}
          iconname="fa-home"
        />
        {!readOnly && currentWallet !== null && !currentWalletOpenError && (
          <SidebarMenuItem
            name="Send"
            routeName={routes.SEND}
            currentRoute={location.pathname}
            iconname="fa-paper-plane"
          />
        )}
        {currentWallet !== null && !currentWalletOpenError && (
          <SidebarMenuItem
            name="Receive"
            routeName={routes.RECEIVE}
            currentRoute={location.pathname}
            iconname="fa-download"
          />
        )}
        {currentWallet !== null && !currentWalletOpenError && (
          <SidebarMenuItem
            name="History"
            routeName={routes.HISTORY}
            currentRoute={location.pathname}
            iconname="fa-list"
          />
        )}
        {currentWallet !== null && !currentWalletOpenError && (
          <SidebarMenuItem
            name="Messages"
            routeName={routes.MESSAGES}
            currentRoute={location.pathname}
            iconname="fa-comments"
          />
        )}
        <SidebarMenuItem
          name="Address Book"
          routeName={routes.ADDRESSBOOK}
          currentRoute={location.pathname}
          iconname="fa-address-book"
        />
        {currentWallet !== null && !currentWalletOpenError && (
          <SidebarMenuItem
            name="Financial Insight"
            routeName={routes.INSIGHT}
            currentRoute={location.pathname}
            iconname="fa-chart-line"
          />
        )}
      </div>

      <div className={cstyles.center}>
        {stateSync === "CONNECTED" && (
          <div className={`${cstyles.padsmallall} ${cstyles.margintopsmall} ${cstyles.blackbg}`}>
            <div>
              {info.latestBlock === info.walletHeight ? (
                <i className={`${cstyles.green} ${"fas"} ${"fa-check"}`} />
              ) : (
                <i className={`${cstyles.yellow} ${"fas"} ${"fa-check"}`} />
              )}
              &nbsp; {info.walletHeight} &nbsp;
            </div>
            {info.latestBlock > info.walletHeight && `(${info.latestBlock - info.walletHeight} blocks behind)`}
          </div>
        )}
        {stateSync === "SYNCING" && (
          <div className={`${cstyles.padsmallall} ${cstyles.margintopsmall} ${cstyles.blackbg}`}>
            <div>
              <i className={`${cstyles.yellow} ${"fas"} ${"fa-sync"}`} />
              &nbsp; Syncing
            </div>
            <div>{`${progress}%`}</div>
          </div>
        )}
        {stateSync === "DISCONNECTED" && (
          <div className={`${cstyles.padsmallall} ${cstyles.margintopsmall} ${cstyles.blackbg}`}>
            <i className={`${cstyles.yellow} ${"fas"} ${"fa-times-circle"}`} />
            &nbsp; Not Connected
          </div>
        )}
        {stateSync === "CONNECTING" && (
          <div className={`${cstyles.padsmallall} ${cstyles.margintopsmall} ${cstyles.blackbg}`}>
            <i className={`${cstyles.yellow} ${"fas"} ${"fa-times-circle"}`} />
            &nbsp; Connecting...
          </div>
        )}
      </div>
    </div>
  );
};

export default Sidebar;
