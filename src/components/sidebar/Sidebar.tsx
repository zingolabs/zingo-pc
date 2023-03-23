import React, { PureComponent, ReactElement } from "react";
import dateformat from "dateformat";
import { RouteComponentProps, withRouter } from "react-router";
import styles from "./Sidebar.module.css";
import cstyles from "../common/Common.module.css";
import routes from "../../constants/routes.json";
import Logo from "../../assets/img/logobig.png";
import { AddressDetail, Info, Transaction, WalletSettings } from "../appstate";
import Utils from "../../utils/utils";
import RPC from "../../rpc/rpc";
import { parseZcashURI, ZcashURITarget } from "../../utils/uris";
import WalletSettingsModal from "../walletsettingsmodal/WalletSettingsModal";
import PayURIModal from "./components/PayURIModal";
import ImportPrivKeyModal from "./components/ImportPrivKeyModal";
import ExportPrivKeyModal from "./components/ExportPrivKeyModal";
import SidebarMenuItem from "./components/SidebarMenuItem";

const { ipcRenderer, remote } = window.require("electron");
const fs = window.require("fs");

type SidebarProps = {
  info: Info;
  setRescanning: (rescan: boolean, prevSyncId: number) => void;
  addresses: AddressDetail[];
  transactions: Transaction[];
  setInfo: (info: Info) => void;
  clearTimers: () => void;
  setSendTo: (targets: ZcashURITarget[] | ZcashURITarget) => void;
  getPrivKeyAsString: (address: string) => string;
  importPrivKeys: (keys: string[], birthday: string) => Promise<boolean>;
  openErrorModal: (title: string, body: string | ReactElement) => void;
  openPassword: (
    confirmNeeded: boolean,
    passwordCallback: (p: string) => void,
    closeCallback: () => void,
    helpText?: string | JSX.Element
  ) => void;
  openPasswordAndUnlockIfNeeded: (successCallback: () => void | Promise<void>) => void;
  lockWallet: () => void;
  encryptWallet: (p: string) => void;
  decryptWallet: (p: string) => Promise<boolean>;
  walletSettings: WalletSettings;
  updateWalletSettings: () => Promise<void>;
  verificationProgress: number;
};

type SidebarState = {
  uriModalIsOpen: boolean;
  uriModalInputValue?: string;
  privKeyModalIsOpen: boolean;
  privKeyInputValue: string | null;
  exportPrivKeysModalIsOpen: boolean;
  exportedPrivKeys: string[];
  walletSettingsModalIsOpen: boolean;
  serverLatestBlock: number;
};

class Sidebar extends PureComponent<SidebarProps & RouteComponentProps, SidebarState> {
  constructor(props: SidebarProps & RouteComponentProps) {
    super(props);
    this.state = {
      uriModalIsOpen: false,
      uriModalInputValue: undefined,
      privKeyModalIsOpen: false,
      exportPrivKeysModalIsOpen: false,
      exportedPrivKeys: [],
      privKeyInputValue: null,
      walletSettingsModalIsOpen: false,
      serverLatestBlock: props.info.latestBlock,
    };

    this.setupMenuHandlers();
  }

  // Handle menu items 
  setupMenuHandlers = async () => {
    const { clearTimers, setSendTo, setInfo, setRescanning, history, openErrorModal, openPasswordAndUnlockIfNeeded } =
      this.props;

    // About
    ipcRenderer.on("about", () => {
      openErrorModal(
        "Zingo PC",
        <div className={cstyles.verticalflex}>
          <div className={cstyles.margintoplarge}>Zingo PC v0.0.1</div>
          <div className={cstyles.margintoplarge}>Built with Electron. Copyright (c) 2023, ZingoLabs.</div>
          <div className={cstyles.margintoplarge}>
            The MIT License (MIT) Copyright (c) 2023 ZingoLabs
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
      const { info } = this.props;

      setSendTo(
        new ZcashURITarget(
          Utils.getDonationAddress(info.testnet),
          Utils.getDefaultDonationAmount(info.testnet),
          Utils.getDefaultDonationMemo(info.testnet)
        )
      );

      history.push(routes.SEND);
    });

    // Import a Private Key
    ipcRenderer.on("import", () => {
      this.openImportPrivKeyModal(null);
    });

    // Pay URI
    ipcRenderer.on("payuri", (event: any, uri: string) => {
      this.openURIModal(uri);
    });

    // Export Seed
    ipcRenderer.on("seed", () => {
      openPasswordAndUnlockIfNeeded(() => {
        const seed = RPC.fetchSeed();
        const birthday = RPC.fetchBirthday();

        openErrorModal(
          "Wallet Seed",
          <div className={cstyles.verticalflex}>
            <div>
              This is your wallet&rsquo;s seed phrase. It can be used to recover your entire wallet.
              <br />
              PLEASE KEEP IT SAFE!
            </div>
            <hr />
            <div
              style={{
                wordBreak: "break-word",
                fontFamily: "monospace, Roboto",
              }}
            >
              {seed}
            </div>
            <hr />
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

    // Export All Transactions
    ipcRenderer.on("exportalltx", async () => {
      const save = await remote.dialog.showSaveDialog({
        title: "Save Transactions As CSV",
        defaultPath: "zingo_pc_transactions.csv",
        filters: [{ name: "CSV File", extensions: ["csv"] }],
        properties: ["showOverwriteConfirmation"],
      });

      if (save.filePath) {
        // Construct a CSV
        const { transactions } = this.props;
        const rows = transactions.flatMap((t) => {
          if (t.detailedTxns) {
            return t.detailedTxns.map((dt) => {
              const normaldate = dateformat(t.time * 1000, "mmm dd yyyy hh::MM tt");

              // Add a single quote "'" into the memo field to force interpretation as a string, rather than as a
              // formula from a rogue memo
              const escapedMemo = dt.memo ? `'${dt.memo.replace(/"/g, '""')}'` : "";
              const price = t.zecPrice ? t.zecPrice.toFixed(2) : "--";

              return `${t.time},"${normaldate}","${t.txid}","${t.type}",${dt.amount},"${dt.address}","${price}","${escapedMemo}"`;
            });
          } else {
            return [];
          }
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
    ipcRenderer.on("encrypt", async () => {
      const { info, lockWallet, encryptWallet, openPassword } = this.props;

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
    ipcRenderer.on("decrypt", async () => {
      const { info, decryptWallet, openPassword } = this.props;

      if (!info.encrypted) {
        openErrorModal("Not Encrypted", "Your wallet is not encrypted and ready for spending.");
      } else {
        // Remove the wallet remove the wallet encryption
        openPassword(
          false,
          async (password) => {
            const success = await decryptWallet(password);
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
    ipcRenderer.on("unlock", () => {
      const { info } = this.props;
      if (!info.encrypted || !info.locked) {
        openErrorModal("Already Unlocked", "Your wallet is already unlocked for spending");
      } else {
        openPasswordAndUnlockIfNeeded(async () => {
          openErrorModal("Unlocked", "Your wallet is unlocked for spending");
        });
      }
    });

    // Rescan
    ipcRenderer.on("rescan", () => {
      // To rescan, we reset the wallet loading
      // So set info the default, and redirect to the loading screen
      clearTimers();

      // Grab the previous sync ID.
      const prevSyncId = JSON.parse(RPC.doSyncStatus()).sync_id;

      RPC.doRescan();

      // Set the rescanning global state to true
      setRescanning(true, prevSyncId);

      // Reset the info object, it will be refetched
      setInfo(new Info());

      history.push(routes.LOADING);
    });

    // Export all private keys
    ipcRenderer.on("exportall", async () => {
      // Get all the addresses and run export key on each of them.
      const { addresses, getPrivKeyAsString } = this.props;
      openPasswordAndUnlockIfNeeded(async () => {
        const privKeysPromise = addresses.map(async (a) => {
          const privKey = getPrivKeyAsString(a.address);
          return `${privKey} #${a}`;
        });
        const exportedPrivKeys = await Promise.all(privKeysPromise);

        this.setState({ exportPrivKeysModalIsOpen: true, exportedPrivKeys });
      });
    });

    // View zcashd
    ipcRenderer.on("zcashd", () => {
      history.push(routes.ZCASHD);
    });

    // Wallet Settings
    ipcRenderer.on("walletSettings", () => {
      this.setState({ walletSettingsModalIsOpen: true });
    });

    // Connect mobile app
    ipcRenderer.on("connectmobile", () => {
      history.push(routes.CONNECTMOBILE);
    });
  };

  closeExportPrivKeysModal = () => {
    this.setState({ exportPrivKeysModalIsOpen: false, exportedPrivKeys: [] });
  };

  openImportPrivKeyModal = (defaultValue: string | null) => {
    const privKeyInputValue = defaultValue || "";
    this.setState({ privKeyModalIsOpen: true, privKeyInputValue });
  };

  setImprovPrivKeyInputValue = (privKeyInputValue: string) => {
    this.setState({ privKeyInputValue });
  };

  closeImportPrivKeyModal = () => {
    this.setState({ privKeyModalIsOpen: false });
  };

  openURIModal = (defaultValue: string | null) => {
    const uriModalInputValue = defaultValue || "";
    this.setState({ uriModalIsOpen: true, uriModalInputValue });
  };

  doImportPrivKeys = async (key: string, birthday: string) => {
    const { importPrivKeys, openErrorModal, setInfo, clearTimers, setRescanning, history, info } = this.props;

    if (key) {
      let keys = key.split(new RegExp("[\\n\\r]+"));
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
      if (Utils.isValidSaplingViewingKey(keys[0]) && info.locked) {
        openErrorModal(
          "Wallet Is Locked",
          "In order to import a Sapling viewing key, your wallet must be unlocked. If you wish to continue, unlock your wallet and try again."
        );
        return;
      }

      // in order to import a private key, the wallet must be unencrypted
      if (Utils.isValidSaplingPrivateKey(keys[0]) && info.encrypted) {
        openErrorModal(
          "Wallet Is Encrypted",
          "In order to import a Sapling private key, your wallet cannot be encrypted. If you wish to continue, remove the encryption from your wallet and try again."
        );
        return;
      }

      // To rescan, we reset the wallet loading
      // So set info the default, and redirect to the loading screen
      clearTimers();

      // Grab the previous sync ID.
      const prevSyncId = JSON.parse(RPC.doSyncStatus()).sync_id;
      const success = await importPrivKeys(keys, birthday);

      if (success) {
        // Set the rescanning global state to true
        setRescanning(true, prevSyncId);

        // Reset the info object, it will be refetched
        setInfo(new Info());

        history.push(routes.LOADING);
      }
    }
  };

  setURIInputValue = (uriModalInputValue: string) => {
    this.setState({ uriModalInputValue });
  };

  closeURIModal = () => {
    this.setState({ uriModalIsOpen: false });
  };

  closeWalletSettingsModal = () => {
    this.setState({ walletSettingsModalIsOpen: false });
  };

  setWalletSpamFilterThreshold = async (threshold: number) => {
    // Call the RPC to set the threshold as an option
    await RPC.setWalletSettingOption("spam_filter_threshold", threshold.toString());

    // Refresh the wallet settings
    await this.props.updateWalletSettings();
  };

  payURI = (uri: string) => {
    console.log(`Paying ${uri}`);
    const { openErrorModal, setSendTo, history } = this.props;

    const errTitle = "URI Error";
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

    const parsedUri = parseZcashURI(uri);
    if (typeof parsedUri === "string") {
      openErrorModal(errTitle, getErrorBody(parsedUri));
      return;
    }

    setSendTo(parsedUri);
    history.push(routes.SEND);
  };

  render() {
    const { location, info, walletSettings, verificationProgress } = this.props;
    const {
      uriModalIsOpen,
      uriModalInputValue,
      privKeyModalIsOpen,
      //privKeyInputValue,
      exportPrivKeysModalIsOpen,
      exportedPrivKeys,
      walletSettingsModalIsOpen,
      serverLatestBlock,
    } = this.state;

    let stateSync = "DISCONNECTED";
    let progress = "100";
    if (serverLatestBlock) {
      if (verificationProgress < 99.9999) {
        stateSync = "SYNCING";
        progress = (verificationProgress).toFixed(2);
      } else {
        stateSync = "CONNECTED";
      }
    }

    return (
      <div>
        {/* Payment URI Modal */}
        <PayURIModal
          modalInput={uriModalInputValue}
          setModalInput={this.setURIInputValue}
          modalIsOpen={uriModalIsOpen}
          closeModal={this.closeURIModal}
          modalTitle="Pay URI"
          actionButtonName="Pay URI"
          actionCallback={this.payURI}
        />

        {/* Import Private Key Modal */}
        <ImportPrivKeyModal
          modalIsOpen={privKeyModalIsOpen}
          // setModalInput={this.setImprovPrivKeyInputValue}
          // modalInput={privKeyInputValue}
          closeModal={this.closeImportPrivKeyModal}
          doImportPrivKeys={this.doImportPrivKeys}
        />

        {/* Exported (all) Private Keys */}
        <ExportPrivKeyModal
          modalIsOpen={exportPrivKeysModalIsOpen}
          exportedPrivKeys={exportedPrivKeys}
          closeModal={this.closeExportPrivKeysModal}
        />

        <WalletSettingsModal
          modalIsOpen={walletSettingsModalIsOpen}
          closeModal={this.closeWalletSettingsModal}
          walletSettings={walletSettings}
          setWalletSpamFilterThreshold={this.setWalletSpamFilterThreshold}
        />

        <div className={[cstyles.center, styles.sidebarlogobg].join(" ")}>
          <div style={{ color: "#888888", fontWeight: "bold", marginBottom: 10 }}>Zingo PC v0.0.1</div>
          <img src={Logo} width="70" alt="logo" />
        </div>

        <div className={styles.sidebar}>
          <SidebarMenuItem
            name="Dashboard"
            routeName={routes.DASHBOARD}
            currentRoute={location.pathname}
            iconname="fa-home"
          />
          <SidebarMenuItem
            name="Send"
            routeName={routes.SEND}
            currentRoute={location.pathname}
            iconname="fa-paper-plane"
          />
          <SidebarMenuItem
            name="Receive"
            routeName={routes.RECEIVE}
            currentRoute={location.pathname}
            iconname="fa-download"
          />
          <SidebarMenuItem
            name="Transactions"
            routeName={routes.TRANSACTIONS}
            currentRoute={location.pathname}
            iconname="fa-list"
          />
          <SidebarMenuItem
            name="Address Book"
            routeName={routes.ADDRESSBOOK}
            currentRoute={location.pathname}
            iconname="fa-address-book"
          />
        </div>

        <div className={cstyles.center}>
          {stateSync === "CONNECTED" && (
            <div className={[cstyles.padsmallall, cstyles.margintopsmall, cstyles.blackbg].join(" ")}>
              <i className={[cstyles.green, "fas", "fa-check"].join(" ")} />
              &nbsp; {info.walletHeight}
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
              &nbsp; Connected
            </div>
          )}
        </div>
      </div>
    );
  }
}

// @ts-ignore
export default withRouter(Sidebar);
