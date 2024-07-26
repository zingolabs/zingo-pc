import React, { ReactElement, useContext, useEffect, useState } from "react";
import dateformat from "dateformat";
import { RouteComponentProps, withRouter } from "react-router";
import styles from "./Sidebar.module.css";
import cstyles from "../common/Common.module.css";
import routes from "../../constants/routes.json";
import { Address, Info, Server, ValueTransfer } from "../appstate";
import Utils from "../../utils/utils";
import RPC from "../../rpc/rpc";
import { parseZcashURI, ZcashURITarget } from "../../utils/uris";
import WalletSettingsModal from "../walletsettingsmodal/WalletSettingsModal";
import PayURIModal from "./components/PayURIModal";
import ImportPrivKeyModal from "./components/ImportPrivKeyModal";
import ExportPrivKeyModal from "./components/ExportPrivKeyModal";
import SidebarMenuItem from "./components/SidebarMenuItem";
import { ContextApp } from "../../context/ContextAppState";
import { Logo } from "../logo";
import native from "../../native.node";

const { ipcRenderer, remote } = window.require("electron");
const fs = window.require("fs");

type SidebarProps = {
  setRescanning: (rescan: boolean, prevSyncId: number) => void;
  setInfo: (info: Info) => void;
  clearTimers: () => void;
  setSendTo: (targets: ZcashURITarget[] | ZcashURITarget) => void;
  getPrivKeyAsString: (address: string) => Promise<string>;
  importPrivKeys: (keys: string[], birthday: string) => boolean;
  openErrorModal: (title: string, body: string | ReactElement) => void;
  openPassword: (
    confirmNeeded: boolean,
    passwordCallback: (p: string) => void,
    closeCallback: () => void,
    helpText?: string | JSX.Element
  ) => void;
  openPasswordAndUnlockIfNeeded: (successCallback: () => void | Promise<void>) => void;
  lockWallet: () => Promise<boolean>;
  encryptWallet: (p: string) => Promise<boolean>;
  decryptWallet: (p: string) => Promise<boolean>;
  updateWalletSettings: () => Promise<void>;
  navigateToLoadingScreen: (b: boolean, c: string, s: Server[]) => void;
};

const Sidebar: React.FC<SidebarProps & RouteComponentProps> = ({ 
  setRescanning, 
  setInfo, 
  clearTimers,
  setSendTo,
  getPrivKeyAsString,
  importPrivKeys,
  openErrorModal,
  openPassword,
  openPasswordAndUnlockIfNeeded,
  lockWallet,
  encryptWallet,
  decryptWallet,
  updateWalletSettings,
  navigateToLoadingScreen,
  history,
  location,
}) => {
  const context = useContext(ContextApp);
  const { info, serverUris, valueTransfers, addresses, verificationProgress, walletSettings, readOnly } = context;

  const [uriModalIsOpen, setUriModalIsOpen] = useState<boolean>(false);
  const [uriModalInputValue, setUriModalInputValue] = useState<string | undefined>(undefined);
  const [privKeyModalIsOpen, setPrivKeyModalIsOpen] = useState<boolean>(false);
  //const [privKeyInputValue, setPrivKeyInputValue] = useState<string | null>(null);
  const [exportPrivKeysModalIsOpen, setExportPrivKeysModalIsOpen] = useState<boolean>(false);
  const [exportedPrivKeys, setExportedPrivKeys] = useState<string[]>([]);
  const [walletSettingsModalIsOpen, setWalletSettingsModalIsOpen] = useState<boolean>(false);

  let stateSync: string = "DISCONNECTED";
  let progress: string = "100";
  if (info.latestBlock) {
    if (verificationProgress < 99.9999) {
      stateSync = "SYNCING";
      progress = (verificationProgress).toFixed(2);
    } else {
      stateSync = "CONNECTED";
    }
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
          <div className={cstyles.margintoplarge}>Zingo PC v1.1.0</div>
          <div className={cstyles.margintoplarge}>Built with Electron. Copyright (c) 2024, ZingoLabs.</div>
          <div className={cstyles.margintoplarge}>
            The MIT License (MIT) Copyright (c) 2024 ZingoLabs
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
          Utils.getDonationAddress(i.testnet),
          Utils.getDefaultDonationAmount(i.testnet),
          Utils.getDefaultDonationMemo(i.testnet)
        )
      );

      history.push(routes.SEND);
    });

    // Import a Private Key
    //ipcRenderer.on("import", () => {
    //  openImportPrivKeyModal(null);
    //});

    // Pay URI
    ipcRenderer.on("payuri", (event: any, uri: string) => {
      openURIModal(uri);
    });

    // Export Seed
    ipcRenderer.on("seed", () => {
      openPasswordAndUnlockIfNeeded(async () => {
        const seed: string = await RPC.fetchSeed();
        const ufvk: string = await RPC.fetchUfvk();
        const birthday: number = await RPC.fetchBirthday();

        console.log('data for seed/ufvk', seed, ufvk, birthday);

        openErrorModal(
          "Wallet Seed",
          <div className={cstyles.verticalflex}>
            {!!seed && (
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
                  {seed}
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
    });

    // Rescan
    ipcRenderer.on("change", async () => {
      // To change to another wallet, we reset the wallet loading
      // and redirect to the loading screen
      clearTimers();

      // Reset the info object, it will be refetched
      setInfo(new Info());

      // interrupt syncing
      const resultInterrupt: string = await native.zingolib_execute_async("interrupt_sync_after_batch", "true");
      console.log("Interrupting sync ....", resultInterrupt);

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
        const rows = vt.flatMap((t: ValueTransfer) => {
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

    // Encrypt wallet
    ipcRenderer.on("encrypt", async (info: any) => { // Obsolete: type Info - check fields
      if (info.encrypted && info.locked) {
        openErrorModal("Already Encrypted", "Your wallet is already encrypted and locked.");
      } else if (info.encrypted && !info.locked) {
        await lockWallet();
        openErrorModal("Locked", "Your wallet has been locked. A password will be needed to spend funds.");
      } else {
        // Encrypt the wallet
        openPassword(
          true,
          async (password) => {
            await encryptWallet(password);
            openErrorModal("Encrypted", "Your wallet has been encrypted. The password will be needed to spend funds.");
          },
          () => {
            openErrorModal("Cancelled", "Your wallet was not encrypted.");
          },
          <div>
            Please enter a password to encrypt your wallet. <br />
            WARNING: If you forget this password, the only way to recover your wallet is from the seed phrase.
          </div>
        );
      }
    });

    // Remove wallet encryption
    ipcRenderer.on("decrypt", async (info: any) => { // Obsolete: type Info - check fields
      if (!info.encrypted) {
        openErrorModal("Not Encrypted", "Your wallet is not encrypted and ready for spending.");
      } else {
        // Remove the wallet remove the wallet encryption
        openPassword(
          false,
          async (password) => {
            const success: boolean = await decryptWallet(password);
            if (success) {
              openErrorModal(
                "Decrypted",
                `Your wallet's encryption has been removed. A password will no longer be needed to spend funds.`
              );
            } else {
              openErrorModal("Decryption Failed", "Wallet decryption failed. Do you have the right password?");
            }
          },
          () => {
            openErrorModal("Cancelled", "Your wallet is still encrypted.");
          },
          ""
        );
      }
    });

    // Unlock wallet
    ipcRenderer.on("unlock", (info: any) => { // Obsolete: type Info - check fields
      if (!info.encrypted || !info.locked) {
        openErrorModal("Already Unlocked", "Your wallet is already unlocked for spending");
      } else {
        openPasswordAndUnlockIfNeeded(() => {
          openErrorModal("Unlocked", "Your wallet is unlocked for spending");
        });
      }
    });

    // Rescan
    ipcRenderer.on("rescan", async () => {
      // To rescan, we reset the wallet loading
      // So set info the default, and redirect to the loading screen
      clearTimers();

      // Grab the previous sync ID.
      const syncStatus: string = await RPC.doSyncStatus();
      const prevSyncId: number = JSON.parse(syncStatus).sync_id;

      RPC.doRescan();

      // Set the rescanning global state to true
      setRescanning(true, prevSyncId);

      // Reset the info object, it will be refetched
      setInfo(new Info());

      navigateToLoadingScreen(false, "", serverUris)
    });

    // Export all private keys
    ipcRenderer.on("exportall", async () => {
      const ad = addresses;
      const ge = getPrivKeyAsString;
      // Get all the addresses and run export key on each of them.
      openPasswordAndUnlockIfNeeded(async () => {
        const _privKeysPromise: Promise<string>[] = ad.map(async (a: Address) => {
          const privKey: string = await ge(a.address);
          return `${privKey} #${a}`;
        });
        const _exportedPrivKeys: string[] = await Promise.all(_privKeysPromise);

        setExportPrivKeysModalIsOpen(true);
        setExportedPrivKeys(_exportedPrivKeys);
      });
    });

    // View zcashd
    ipcRenderer.on("zcashd", () => {
      history.push(routes.ZCASHD);
    });

    // Wallet Settings
    ipcRenderer.on("walletSettings", () => {
      setWalletSettingsModalIsOpen(true);
    });

    // Connect mobile app
    ipcRenderer.on("connectmobile", () => {
      history.push(routes.CONNECTMOBILE);
    });
  };

  const closeExportPrivKeysModal = () => {
    setExportPrivKeysModalIsOpen(false);
    setExportedPrivKeys([]);
  };

  //const openImportPrivKeyModal = (defaultValue: string | null) => {
  //  const _privKeyInputValue: string = defaultValue || "";
  //  setPrivKeyModalIsOpen(true);
  //  setPrivKeyInputValue(_privKeyInputValue);
  //};

  //const setImprovPrivKeyInputValue = (_privKeyInputValue: string) => {
  //  setPrivKeyInputValue(_privKeyInputValue);
  //};

  const closeImportPrivKeyModal = () => {
    setPrivKeyModalIsOpen(false);
  };

  const openURIModal = (defaultValue: string | null) => {
    const _uriModalInputValue: string = defaultValue || "";
    setUriModalIsOpen(true);
    setUriModalInputValue(_uriModalInputValue);
  };

  const doImportPrivKeys = async (key: string, birthday: string) => {
    if (key) {
      let keys: string[] = key.split(new RegExp("[\\n\\r]+"));
      if (!keys || keys.length === 0) {
        openErrorModal("No Keys Imported", "No keys were specified, so none were imported");
        return;
      }

      // Filter out empty lines and clean up the private keys
      keys = keys.filter((k) => !(k.trim().startsWith("#") || k.trim().length === 0));

      // Special case.
      // Sometimes, when importing from a paperwallet or such, the key is split by newlines, and might have
      // been pasted like that. So check to see if the whole thing is one big private key
      if (Utils.isValidSaplingPrivateKey(keys.join("")) || Utils.isValidSaplingViewingKey(keys.join(""))) {
        keys = [keys.join("")];
      }

      if (keys.length > 1) {
        openErrorModal("Multiple Keys Not Supported", "Please import one key at a time");
        return;
      }

      if (!Utils.isValidSaplingPrivateKey(keys[0]) && !Utils.isValidSaplingViewingKey(keys[0])) {
        openErrorModal(
          "Bad Key",
          "The input key was not recognized as either a sapling spending key or a sapling viewing key"
        );
        return;
      }

      // in order to import a viewing key, the wallet can be encrypted,
      // but it must be unlocked
      //if (Utils.isValidSaplingViewingKey(keys[0]) && info.locked) {
      //  openErrorModal(
      //    "Wallet Is Locked",
      //    "In order to import a Sapling viewing key, your wallet must be unlocked. If you wish to continue, unlock your wallet and try again."
      //  );
      //  return;
      //}

      // in order to import a private key, the wallet must be unencrypted
      //if (Utils.isValidSaplingPrivateKey(keys[0]) && info.encrypted) {
      //  openErrorModal(
      //    "Wallet Is Encrypted",
      //    "In order to import a Sapling private key, your wallet cannot be encrypted. If you wish to continue, remove the encryption from your wallet and try again."
      //  );
      //  return;
      //}

      // To rescan, we reset the wallet loading
      // So set info the default, and redirect to the loading screen
      clearTimers();

      // Grab the previous sync ID.
      const syncStatus: string = await RPC.doSyncStatus();
      const prevSyncId: number = JSON.parse(syncStatus).sync_id;
      const success: boolean = importPrivKeys(keys, birthday);

      if (success) {
        // Set the rescanning global state to true
        setRescanning(true, prevSyncId);

        // Reset the info object, it will be refetched
        setInfo(new Info());

        navigateToLoadingScreen(false, "", serverUris)
      }
    }
  };

  const setURIInputValue = (_uriModalInputValue: string) => {
    setUriModalInputValue(_uriModalInputValue);
  };

  const closeURIModal = () => {
    setUriModalIsOpen(false);
  };

  const closeWalletSettingsModal = () => {
    setWalletSettingsModalIsOpen(false);
  };

  const setWalletSpamFilterThreshold = async (threshold: number) => {
    // Call the RPC to set the threshold as an option
    await RPC.setWalletSettingOption("transaction_filter_threshold", threshold.toString());

    // Refresh the wallet settings
    await updateWalletSettings();
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

    const parsedUri: string | ZcashURITarget[] = await parseZcashURI(uri);
    if (typeof parsedUri === "string") {
      if (parsedUri.toLowerCase().startsWith('error')) {
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
      {/* Payment URI Modal */}
      <PayURIModal
        modalInput={uriModalInputValue}
        setModalInput={setURIInputValue}
        modalIsOpen={uriModalIsOpen}
        closeModal={closeURIModal}
        modalTitle="Pay URI"
        actionButtonName="Pay URI"
        actionCallback={payURI}
      />

      {/* Import Private Key Modal */}
      <ImportPrivKeyModal
        modalIsOpen={privKeyModalIsOpen}
        // setModalInput={this.setImprovPrivKeyInputValue}
        // modalInput={privKeyInputValue}
        closeModal={closeImportPrivKeyModal}
        doImportPrivKeys={doImportPrivKeys}
      />

      {/* Exported (all) Private Keys */}
      <ExportPrivKeyModal
        modalIsOpen={exportPrivKeysModalIsOpen}
        exportedPrivKeys={exportedPrivKeys}
        closeModal={closeExportPrivKeysModal}
      />

      <WalletSettingsModal
        modalIsOpen={walletSettingsModalIsOpen}
        closeModal={closeWalletSettingsModal}
        walletSettings={walletSettings}
        setWalletSpamFilterThreshold={setWalletSpamFilterThreshold}
      />

      <div className={[cstyles.center, styles.sidebarlogobg].join(" ")}>
        <Logo readOnly={readOnly} />
      </div>

      <div className={styles.sidebar}>
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
      </div>
    </div>
  );
}

// @ts-ignore
export default withRouter(Sidebar);
