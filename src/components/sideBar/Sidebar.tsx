import React, { ReactElement, useContext, useEffect, useRef, useState } from "react";
import { RouteComponentProps, withRouter } from "react-router";
import styles from "./Sidebar.module.css";
import cstyles from "../common/Common.module.css";
import routes from "../../constants/routes.json";
import { parseZcashURI, ZcashURITarget } from "../../utils/uris";
import PayURIModal from "./components/PayURIModal";
import SidebarMenuItem from "./components/SidebarMenuItem";
import { ContextApp } from "../../context/ContextAppState";
import { Logo } from "../logo";
import SelectWallet from "./components/SelectWallet";
import { WalletType } from "../appstate";

const { ipcRenderer } = window.require("electron");

type SidebarProps = {
  doRescan: () => void;
  navigateToLoadingScreenChangingWallet: () => void;
};

const Sidebar: React.FC<SidebarProps & RouteComponentProps> = ({ 
  doRescan,
  history,
  location,
  navigateToLoadingScreenChangingWallet,
}) => {
  const context = useContext(ContextApp);
  const { info, verificationProgress, readOnly, seed_phrase, ufvk, birthday, setSendTo, openErrorModal, currentWallet, currentWalletOpenError } = context;

  const [uriModalIsOpen, setUriModalIsOpen] = useState<boolean>(false);
  const [uriModalInputValue, setUriModalInputValue] = useState<string | undefined>(undefined);

  const currentWalletRef = useRef<WalletType | null>(null);
  const currentWalletOpenErrorRef = useRef<string>('');

  let stateSync: string = "";
  let progress: string = "";
  console.log('PPPPPPPROGRESS', verificationProgress);
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
      stateSync = "CONNECTING"
    }
  } else {
    // no server latest block
    stateSync = "DISCONNECTED"
  }

  useEffect(() => { currentWalletRef.current = currentWallet; }, [currentWallet]);
  useEffect(() => { currentWalletOpenErrorRef.current = currentWalletOpenError; }, [currentWalletOpenError]);

  // Handle menu items
  useEffect(() => {

    // About
    const about = (_event: any) => {
      openErrorModal(
        "Zingo PC",
        <div className={cstyles.verticalflex}>
          <div className={cstyles.margintoplarge}>Zingo PC v2.0.7</div>
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
        </div>
      );
    };

    // Pay URI
    const payuri = (_event: any, uri: string) => {
      if (!currentWalletRef.current || !!currentWalletOpenErrorRef.current) {
        openErrorModal("Pay Uri", "There is not an active Wallet to perform the action.");
      } else {
        openURIModal(uri);
      }
    };

    // Export Seed
    const seed = async (_event: any) => {
      if (!currentWalletRef.current || !!currentWalletOpenErrorRef.current) {
        openErrorModal("Wallet Seed Phrase/Viewing Key", "There is not an active Wallet to perform the action.");
        return;
      }

      openErrorModal(
        "Wallet Seed Phrase / Viewing Key",
        <div className={cstyles.verticalflex}>
          {!!seed_phrase && (
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
                  fontWeight: 'bolder',
                }}
              >
                {seed_phrase}
              </div>
              <hr style={{ width: "100%" }} />
            </>
          )}
          {!!ufvk && (
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
                  fontWeight: 'bolder',
                }}
              >
                {ufvk}
              </div>
              <hr style={{ width: "100%" }} />
            </>
          )}
          <div
            style={{
              fontFamily: "monospace, Roboto",
            }}
          >
            {'Birthday: ' + birthday}
          </div>
        </div>
      );        
    };

    const rescan = async (_event: any) => {
      if (!currentWalletRef.current || !!currentWalletOpenErrorRef.current) {
        openErrorModal("Rescan Wallet", "There is not an active Wallet to perform the action.");
      } else {
        doRescan();
      }
    };

    const addnewwallet = (_event: any) => {
      history.push(routes.ADDNEWWALLET, { mode: 'addnew' });
    };

    const settingswallet = (_event: any) => {
      if (!currentWalletRef.current || !!currentWalletOpenErrorRef.current) {
        openErrorModal("Wallet Settings", "There is not an active Wallet to perform the action.");
      } else {
        history.push(routes.ADDNEWWALLET, { mode: 'settings' });
      }
    };

    const deletewallet = (_event: any) => {
      if (!currentWalletRef.current) {
        openErrorModal("Delete Wallet", "There is not an active Wallet to perform the action.");
      } else {
        history.push(routes.ADDNEWWALLET, { mode: 'delete' });
      }
    };

    console.log('ONNNNNNNNNNNNNNNNNNNNNNNN');
    ipcRenderer.on("about", about);
    ipcRenderer.on("payuri", payuri);
    ipcRenderer.on("seed", seed);
    ipcRenderer.on("rescan", rescan);
    ipcRenderer.on("addnewwallet", addnewwallet);
    ipcRenderer.on("settingswallet", settingswallet);
    ipcRenderer.on("deletewallet", deletewallet);

    return () => {
      console.log('OFFFFFFFFFFFFFFFFFFFFFF')
      ipcRenderer.removeListener("about", about);
      ipcRenderer.off("payuri", payuri);
      ipcRenderer.off("seed", seed);
      ipcRenderer.off("rescan", rescan);
      ipcRenderer.off("addnewwallet", addnewwallet);
      ipcRenderer.off("settingswallet", settingswallet);
      ipcRenderer.removeListener("deletewallet", deletewallet);
    };
  }, [birthday, doRescan, history, openErrorModal, seed_phrase, ufvk]);

  const openURIModal = (defaultValue: string | null) => {
    const _uriModalInputValue: string = defaultValue || "";
    setUriModalIsOpen(true);
    setUriModalInputValue(_uriModalInputValue);
  };

  const setURIInputValue = (_uriModalInputValue: string) => {
    setUriModalInputValue(_uriModalInputValue);
  };

  const closeURIModal = () => {
    setUriModalIsOpen(false);
  };

  const payURI = async (uri: string) => {
    console.log(`Paying ${uri}`);

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

    const parsedUri: string | ZcashURITarget = await parseZcashURI(uri, currentWallet ? currentWallet.chain_name: '');
    if (typeof parsedUri === "string") {
      if (!parsedUri || parsedUri.toLowerCase().startsWith('error')) {
        openErrorModal(errTitle, getErrorBody(parsedUri));
        return;
      } else {
        setSendTo({ address: parsedUri });
      }
    } else {
      setSendTo(parsedUri);
    }
    
    history.push(routes.SEND);
  };

  return (
    <div>
      <PayURIModal
        modalInput={uriModalInputValue}
        setModalInput={setURIInputValue}
        modalIsOpen={uriModalIsOpen}
        closeModal={closeURIModal}
        modalTitle="Pay URI"
        actionButtonName="Pay URI"
        actionCallback={payURI}
      />

      <div className={[cstyles.center, styles.sidebarlogobg].join(" ")}>
        <Logo readOnly={readOnly} onlyVersion={false} />
      </div>

      <div className={styles.sidebar}>
        <SelectWallet
          navigateToLoadingScreenChangingWallet={navigateToLoadingScreenChangingWallet}
        />
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
          <div className={[cstyles.padsmallall, cstyles.margintopsmall, cstyles.blackbg].join(" ")}>
            <div>
              {info.latestBlock === info.walletHeight ? (
                <i className={[cstyles.green, "fas", "fa-check"].join(" ")} />
              ) : (
                <i className={[cstyles.yellow, "fas", "fa-check"].join(" ")} />
              )}
              &nbsp; {info.walletHeight} &nbsp;
            </div>
            {info.latestBlock > info.walletHeight && `(${info.latestBlock - info.walletHeight} blocks behind)`}
          </div>
        )}
        {stateSync === "SYNCING" && (
          <div className={[cstyles.padsmallall, cstyles.margintopsmall, cstyles.blackbg].join(" ")}>
            <div>
              <i className={[cstyles.yellow, "fas", "fa-sync"].join(" ")} />
              &nbsp; Syncing
            </div>
            <div>{`${progress}%`}</div>
          </div>
        )}
        {stateSync === "DISCONNECTED" && (
          <div className={[cstyles.padsmallall, cstyles.margintopsmall, cstyles.blackbg].join(" ")}>
            <i className={[cstyles.yellow, "fas", "fa-times-circle"].join(" ")} />
            &nbsp; Not Connected
          </div>
        )}
        {stateSync === "CONNECTING" && (
          <div className={[cstyles.padsmallall, cstyles.margintopsmall, cstyles.blackbg].join(" ")}>
            <i className={[cstyles.yellow, "fas", "fa-times-circle"].join(" ")} />
            &nbsp; Connecting... 
          </div>
        )}
      </div>
    </div>
  );
}

// @ts-ignore
export default withRouter(Sidebar);
