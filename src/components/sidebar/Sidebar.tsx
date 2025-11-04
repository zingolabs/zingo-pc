import React, { ReactElement, useContext, useEffect, useState } from "react";
import dateformat from "dateformat";
import { RouteComponentProps, withRouter } from "react-router";
import styles from "./Sidebar.module.css";
import cstyles from "../common/Common.module.css";
import routes from "../../constants/routes.json";
import { InfoClass, ServerClass, ValueTransferClass } from "../appstate";
import Utils from "../../utils/utils";
import { parseZcashURI, ZcashURITarget } from "../../utils/uris";
import PayURIModal from "./components/PayURIModal";
import SidebarMenuItem from "./components/SidebarMenuItem";
import { ContextApp } from "../../context/ContextAppState";
import { Logo } from "../logo";
import native from "../../native.node";
import { ServerChainNameEnum } from "../appstate/enums/ServerChainNameEnum";
import SelectWallet from "./components/SelectWallet";
import { WalletType } from "../appstate/types/WalletType";

const { ipcRenderer, remote } = window.require("electron");
const fs = window.require("fs");

type SidebarProps = {
  setInfo: (info: InfoClass) => void;
  clearTimers: () => void;
  navigateToLoadingScreen: (b: boolean, c: string, s: ServerClass[]) => void;
  doRescan: () => void;
  setWallets: (c: number, w: WalletType[]) => void;
};

const Sidebar: React.FC<SidebarProps & RouteComponentProps> = ({ 
  setInfo, 
  clearTimers,
  navigateToLoadingScreen,
  doRescan,
  setWallets,
  history,
  location,
}) => {
  const context = useContext(ContextApp);
  const { info, serverUris, valueTransfers, verificationProgress, readOnly, serverChainName, seed_phrase, ufvk, birthday, setSendTo, openErrorModal, currentWalletId, wallets } = context;

  const [uriModalIsOpen, setUriModalIsOpen] = useState<boolean>(false);
  const [uriModalInputValue, setUriModalInputValue] = useState<string | undefined>(undefined);

  let stateSync: string = "";
  let progress: string = "";
  if (info.latestBlock) {
    if (verificationProgress) {
      if (verificationProgress === 100) {
        stateSync = "CONNECTED";
        progress = "100";
      } else {
        stateSync = "SYNCING";
        progress = (verificationProgress).toFixed(2);
      }
    } else {
      // no verification progress fetched
      stateSync = "CONNECTING"
    }
  } else {
    // no server latest block
    stateSync = "DISCONNECTED"
  }

  useEffect(() => {
    setupMenuHandlers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle menu items 
  const setupMenuHandlers = async (): Promise<void> => {

    // About
    ipcRenderer.on("about", () => {
      openErrorModal(
        "Zingo PC",
        <div className={cstyles.verticalflex}>
          <div className={cstyles.margintoplarge}>Zingo PC v2.0.1</div>
          <div className={cstyles.margintoplarge}>Built with Electron. Copyright (c) 2025, ZingoLabs.</div>
          <div className={cstyles.margintoplarge}>
            The MIT License (MIT) Copyright (c) 2025 ZingoLabs
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
    });

    // Donate button
    ipcRenderer.on("donate", () => {
      const i = info;
      setSendTo(
        new ZcashURITarget(
          Utils.getDonationAddress(i.chainName !== ServerChainNameEnum.mainChainName),
          Utils.getDefaultDonationAmount(i.chainName !== ServerChainNameEnum.mainChainName),
          Utils.getDefaultDonationMemo(i.chainName !== ServerChainNameEnum.mainChainName)
        )
      );

      history.push(routes.SEND);
    });


    // Pay URI
    ipcRenderer.on("payuri", (event: any, uri: string) => {
      openURIModal(uri);
    });

    // Export Seed
    ipcRenderer.on("seed", async () => {
      //console.log('data for seed/ufvk & birthday', seed_phrase, ufvk, birthday);

      openErrorModal(
        "Wallet Seed",
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
    });

    ipcRenderer.on("change", async () => {
      // To change to another wallet, we reset the wallet loading
      // and redirect to the loading screen
      clearTimers();

      // Reset the info object, it will be refetched
      setInfo(new InfoClass());

      // interrupt syncing
      const resultInterrupt: string = await native.pause_sync();
      console.log("Pausing sync ....", resultInterrupt);

      navigateToLoadingScreen(true, "Change to another wallet...", serverUris)
    });

    // Export All Transactions
    ipcRenderer.on("exportalltx", async () => {
      const save = await remote.dialog.showSaveDialog({
        title: "Save Transactions As CSV",
        defaultPath: "zingo_pc_transactions.csv",
        filters: [{ name: "CSV File", extensions: ["csv"] }],
        properties: ["showOverwriteConfirmation"],
      });

      const vt = valueTransfers;

      if (save.filePath) {
        // Construct a CSV
        const rows = vt.flatMap((t: ValueTransferClass) => {
          const normaldate = dateformat(t.time * 1000, "mmm dd yyyy hh::MM tt");

          // Add a single quote "'" into the memo field to force interpretation as a string, rather than as a
          // formula from a rogue memo
          const escapedMemo = t.memos && t.memos.length > 0 ? `'${t.memos.join("").replace(/"/g, '""')}'` : "";
          const price = t.zec_price ? t.zec_price.toFixed(2) : "--";

          return `${t.time},"${normaldate}","${t.txid}","${t.type}",${t.amount},"${t.address}","${price}","${escapedMemo}"`;
        });

        const header = [`UnixTime, Date, Txid, Type, Amount, Address, ZECPrice, Memo`];

        try {
          await fs.promises.writeFile(save.filePath, header.concat(rows).join("\n"));
        } catch (err) {
          openErrorModal("Error Exporting Transactions", `${err}`);
        }
      }
    });

    ipcRenderer.on("rescan", async () => {
      // To rescan, we reset the wallet loading
      doRescan();
    });

    // View Server Info
    ipcRenderer.on("serverinfo", () => {
      history.push(routes.SERVERINFO);
    });
  };

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

    const parsedUri: string | ZcashURITarget = await parseZcashURI(uri, serverChainName);
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
        <Logo readOnly={readOnly} />
      </div>

      <div className={styles.sidebar}>
        <SelectWallet
          currentWalletId={currentWalletId}
          wallets={wallets}
          setWallets={setWallets}
        />
        <SidebarMenuItem
          name="Dashboard"
          routeName={routes.DASHBOARD}
          currentRoute={location.pathname}
          iconname="fa-home"
        />
        {!readOnly && (
          <SidebarMenuItem
            name="Send"
            routeName={routes.SEND}
            currentRoute={location.pathname}
            iconname="fa-paper-plane"
          />
        )}
        <SidebarMenuItem
          name="Receive"
          routeName={routes.RECEIVE}
          currentRoute={location.pathname}
          iconname="fa-download"
        />
        <SidebarMenuItem
          name="History"
          routeName={routes.HISTORY}
          currentRoute={location.pathname}
          iconname="fa-list"
        />
        <SidebarMenuItem
          name="Messages"
          routeName={routes.MESSAGES}
          currentRoute={location.pathname}
          iconname="fa-comments"
        />
        <SidebarMenuItem
          name="Address Book"
          routeName={routes.ADDRESSBOOK}
          currentRoute={location.pathname}
          iconname="fa-address-book" 
        />
        <SidebarMenuItem
          name="Financial Insight"
          routeName={routes.INSIGHT}
          currentRoute={location.pathname}
          iconname="fa-chart-line" 
        />
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
